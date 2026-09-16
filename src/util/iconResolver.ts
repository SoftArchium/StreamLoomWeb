/**
 * Asynchronous channel-icon backfill.
 *
 * Every channel already carries an icon URL on our own CDN
 * (`icons.softarchium.com/<channel-id>.webp`). Some channels have no object
 * there, in which case the UI falls back to a local placeholder. This module
 * finds a real icon for those channels from the public iptv-org indexes and
 * stores it through `/api/icons`.
 *
 * Nothing here may slow the app down, so:
 * - The iptv-org indexes are large, and their fetch/parse/match all happen in a
 *   Web Worker (`icon.worker`), never on the main thread.
 * - Work is queued and released on an idle callback, one channel at a time.
 * - Each channel is attempted at most once per session, and only because it is
 *   visible or being watched — there is no catalogue-wide crawl.
 * - A working CDN icon is never looked up: only a missing icon, or a request
 *   that actually failed, queues anything.
 */

import type { IconWorkerRequest, IconWorkerResponse } from '../workers/icon.worker'

/** Resolved icon URL per channel id, and the ids already attempted. */
const resolved = new Map<string, string>()
const attempted = new Set<string>()
const listeners = new Set<(channelId: string) => void>()

/** Pending lookups, drained serially so a burst costs one request at a time. */
const pending: IconWorkerRequest[] = []
let draining = false
let worker: Worker | null = null
let workerUnavailable = false

/**
 * Ceiling for one worker round trip.
 *
 * The first lookup also downloads both iptv-org indexes, so this is generous. It
 * exists only so a wedged worker cannot stall the queue forever.
 */
const LOOKUP_TIMEOUT_MS = 30_000

/** Fires with the channel id whose icon became available. */
export function onIconResolved(listener: (channelId: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The stored icon URL for a channel, or null when none has been resolved. */
export function getResolvedIcon(channelId: string): string | null {
  return resolved.get(channelId) ?? null
}

/** Clears per-channel state so a scheduled refresh can retry every channel. */
export function resetIconResolution(): void {
  resolved.clear()
  attempted.clear()
}

/**
 * Registers a channel for a background icon lookup.
 *
 * Safe to call on every render: unknown, already-attempted and already-resolved
 * channels return immediately, and the lookup itself is deferred.
 */
export function scheduleIconBackfill(
  channelId: string,
  name: string,
  country: string | null,
): void {
  if (!channelId || attempted.has(channelId) || resolved.has(channelId)) return
  attempted.add(channelId)
  pending.push({ channelId, name, country: country || null })
  scheduleDrain()
}

/** Creates the lookup worker once; null when workers are unavailable. */
function ensureWorker(): Worker | null {
  if (worker || workerUnavailable) return worker
  if (typeof Worker === 'undefined') {
    workerUnavailable = true
    return null
  }
  try {
    worker = new Worker(new URL('../workers/icon.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    workerUnavailable = true
    return null
  }
  return worker
}

/** Runs the queue on an idle callback so it can never delay a paint. */
function scheduleDrain(): void {
  if (draining) return
  draining = true
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(() => { void drain() }, { timeout: 2000 })
  } else {
    setTimeout(() => { void drain() }, 300)
  }
}

/**
 * Resolves the queued channels one at a time.
 *
 * Each lookup is answered by the worker, and an icon is only stored once the
 * worker has found one. Any failure leaves the placeholder exactly where it was.
 */
async function drain(): Promise<void> {
  try {
    const lookup = ensureWorker()
    if (!lookup) return

    while (pending.length > 0) {
      const job = pending.shift()!
      if (resolved.has(job.channelId)) continue

      const logoUrl = await lookupIcon(lookup, job)
      if (!logoUrl) continue

      const storedUrl = await storeIcon(job.channelId, logoUrl)
      if (!storedUrl) continue

      resolved.set(job.channelId, storedUrl)
      listeners.forEach((fn) => {
        try {
          fn(job.channelId)
        } catch {}
      })
    }
  } finally {
    pending.length = 0
    draining = false
  }
}

/** One request/response round trip with the worker. */
function lookupIcon(target: Worker, job: IconWorkerRequest): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      target.removeEventListener('message', onMessage)
      target.removeEventListener('error', onError)
      resolve(value)
    }
    const onMessage = (event: MessageEvent<IconWorkerResponse>) => {
      if (event.data?.channelId === job.channelId) finish(event.data.logoUrl)
    }
    const onError = () => finish(null)

    target.addEventListener('message', onMessage)
    target.addEventListener('error', onError)
    timer = setTimeout(() => finish(null), LOOKUP_TIMEOUT_MS)
    target.postMessage(job)
  })
}

/** Asks the edge to fetch and store the icon, returning the URL to render. */
async function storeIcon(channelId: string, sourceUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/icons/${encodeURIComponent(channelId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sourceUrl }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { stored?: boolean; url?: string }
    return data.url || null
  } catch {
    return null
  }
}
