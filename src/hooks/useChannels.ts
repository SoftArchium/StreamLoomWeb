import { useEffect, useState, useCallback } from 'react'
import type { Category, EnrichedChannel, EpgProgram } from '../api/types'
import {
  fetchCatalogueFromRedis,
  fetchEpgFromRedis,
  fetchEpgIdsFromRedis,
  isUpstashConfigured,
} from '../api/redis'
import { enrichChannels } from '../util/enrich'
import {
  clearStoredCatalogue,
  readStoredCatalogue,
  writeStoredCatalogue,
} from '../util/catalogueStore'
import type {
  CatalogueWorkerRequest,
  CatalogueWorkerResponse,
} from '../workers/catalogue.worker'
import {
  fetchEdgeVerifiedStreams,
  getBrokenSet,
  getWorkingMapSnapshot,
  isHideBrokenStreamsEnabled,
  onStreamStateChange,
  unmarkStreamBroken,
} from '../util/stream'
import { resetIconResolution } from '../util/iconResolver'

export type { EnrichedChannel }

interface UseChannelsResult {
  channels: EnrichedChannel[]
  allChannels: EnrichedChannel[]
  categories: Category[]
  epgChannelIds: Set<string>
  loading: boolean
  error: string | null
  refresh: () => void
  /** Where catalogue data was last loaded from */
  source: 'redis' | 'cache' | null
}

interface CatalogueLoad {
  channels: EnrichedChannel[]
  categories: Category[]
  epgIds: string[]
}

// Module-level in-memory state (shared across all hook instances)
let _channels: EnrichedChannel[] | null = null
let _categories: Category[] | null = null
let _epgIds: Set<string> | null = null
let _loading = true
let _error: string | null = null
let _source: 'redis' | 'cache' | null = null
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
}

onStreamStateChange(() => {
  notify()
})

const WORKER_TIMEOUT_MS = 25_000

/**
 * Runs the load inside a Web Worker so Redis page parsing and the ~40k-row join
 * stay off the main thread. Resolves undefined when no worker can be used, which
 * tells the caller to fall back to the main thread.
 */
function loadInWorker(): Promise<CatalogueLoad | null | undefined> {
  return new Promise((resolve) => {
    if (typeof Worker === 'undefined') {
      resolve(undefined)
      return
    }

    let worker: Worker
    try {
      worker = new Worker(new URL('../workers/catalogue.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      resolve(undefined)
      return
    }

    let settled = false
    const finish = (value: CatalogueLoad | null | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      resolve(value)
    }

    const timer = setTimeout(() => finish(undefined), WORKER_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent<CatalogueWorkerResponse>) => {
      const data = event.data
      if (data && data.ok) {
        finish({ channels: data.channels, categories: data.categories, epgIds: data.epgIds })
      } else {
        finish(null)
      }
    }
    worker.onerror = () => finish(undefined)

    const request: CatalogueWorkerRequest = { working: getWorkingMapSnapshot() }
    worker.postMessage(request)
  })
}

/** Fallback for environments without workers: identical work, main thread. */
async function loadOnMainThread(): Promise<CatalogueLoad | null> {
  const catalogue = await fetchCatalogueFromRedis()
  if (!catalogue) return null
  const epgIds = await fetchEpgIdsFromRedis()
  return {
    channels: enrichChannels(catalogue.channels, catalogue.streams, getWorkingMapSnapshot()),
    categories: catalogue.categories,
    epgIds,
  }
}

async function loadCatalogue(): Promise<CatalogueLoad | null> {
  const fromWorker = await loadInWorker()
  if (fromWorker !== undefined) return fromWorker
  return loadOnMainThread()
}

/** Applies a freshly loaded catalogue to the shared module state. */
function applyLoad(load: CatalogueLoad, source: 'redis' | 'cache') {
  _channels = load.channels
  _categories = load.categories
  _epgIds = new Set(load.epgIds)
  _source = source
  _loading = false
  _error = null
}

async function loadData(force = false) {
  if (!force && _channels) return

  // Instant path: IndexedDB first, then refresh from Redis in the background.
  if (!force) {
    const stored = await readStoredCatalogue()
    if (stored) {
      _channels = stored.channels
      _categories = stored.categories
      _epgIds = new Set(stored.epgIds)
      _source = 'cache'
      _loading = false
      _error = null
      notify()
      loadData(true).catch(() => {})
      return
    }
  }

  // Only surface the spinner when there is nothing on screen already.
  if (!_channels || _channels.length === 0) {
    _loading = true
    notify()
  }

  try {
    const load = await loadCatalogue()

    if (!load) {
      _loading = false
      _error = isUpstashConfigured
        ? 'Catalogue unavailable — the sync worker has not published it to Redis yet.'
        : 'Upstash Redis is not configured.'
      notify()
      return
    }

    applyLoad(load, 'redis')
    notify()

    writeStoredCatalogue({
      channels: load.channels,
      categories: load.categories,
      epgIds: load.epgIds,
    }).catch(() => {})
  } catch (e) {
    _error = (e as Error).message
    _loading = false
    notify()
  }
}

// Kick off loading as soon as this module is first imported
loadData()

/**
 * How often the catalogue, schedules and dead-stream list are re-read.
 *
 * Four hours keeps a long-lived tab (a TV browser session can stay open all day)
 * within one refresh of the sync worker, without polling Redis in the meantime.
 */
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Drops cached schedules and icon lookups so the next refresh re-reads them. */
function invalidateEphemeralCaches() {
  _epgCache.clear()
  resetIconResolution()
}

let _refreshTimer: ReturnType<typeof setInterval> | null = null

/** Cap on channels re-probed per tick, so a large broken set cannot stall. */
const REVALIDATE_LIMIT = 50

/**
 * Re-probes channels marked dead and clears the ones that respond again.
 *
 * Streams die and recover on their own schedule, so a channel marked broken
 * earlier is not necessarily broken now. Candidate URLs come from the loaded
 * catalogue rather than the working-stream cache, which is what makes this work
 * for channels that were marked broken before a working stream was ever cached.
 *
 * Best-effort and bounded: a failure leaves the channel marked broken, and only
 * the first REVALIDATE_LIMIT channels are checked per tick.
 */
async function revalidateBrokenStreams() {
  if (!_channels) return
  const broken = [...getBrokenSet()]
  if (broken.length === 0) return

  const byId = new Map(_channels.map((c) => [c.id, c]))
  const targets = broken
    .map((id) => byId.get(id))
    .filter((c): c is EnrichedChannel => Boolean(c && c.streams.length > 0))
    .slice(0, REVALIDATE_LIMIT)

  for (const channel of targets) {
    try {
      const result = await fetchEdgeVerifiedStreams(
        channel.id,
        channel.streams.map((s) => s.url),
        channel.streams.map((s) => s.quality),
        5000,
      )
      if (result?.workingStream) unmarkStreamBroken(channel.id)
    } catch {
      // Leave the channel marked broken.
    }
  }
}

/**
 * Starts the periodic refresh.
 *
 * Guarded so the timer exists once per module load even though `useChannels` is
 * called from every page. Each tick re-reads the catalogue, clears the schedule
 * and icon caches, and re-probes streams that were previously marked dead.
 */
function startRefreshLoop() {
  if (_refreshTimer) return
  _refreshTimer = setInterval(() => {
    invalidateEphemeralCaches()
    loadData(true).catch(() => {})
    revalidateBrokenStreams().catch(() => {})
  }, REFRESH_INTERVAL_MS)
}

startRefreshLoop()

export function useChannels(): UseChannelsResult {
  const [, setTick] = useState(0)

  useEffect(() => {
    const rerender = () => setTick((t) => t + 1)
    _listeners.add(rerender)
    return () => { _listeners.delete(rerender) }
  }, [])

  const refresh = useCallback(() => loadData(true), [])

  const raw = _channels ?? []
  const hideBroken = isHideBrokenStreamsEnabled()
  const brokenSet = getBrokenSet()
  const filtered = hideBroken && brokenSet.size > 0
    ? raw.filter((c) => !brokenSet.has(c.id))
    : raw

  return {
    channels: filtered,
    allChannels: raw,
    categories: _categories ?? [],
    epgChannelIds: _epgIds ?? new Set(),
    loading: _loading,
    error: _error,
    refresh,
    source: _source,
  }
}

/** Drops the persisted and in-memory catalogue. Used by Settings. */
export async function clearCatalogueCache() {
  await clearStoredCatalogue()
  _channels = null
  _categories = null
  _epgIds = null
  _source = null
}

// ---- Debug helpers ----
export function getDataSource() { return _source }
export function getUpstashConfigured() { return isUpstashConfigured }

// ---- EPG (read from Redis on demand, one key per channel) ----
const _epgCache = new Map<string, EpgProgram[]>()

export function useEpg(channelId: string | null) {
  const [fetchedPrograms, setFetchedPrograms] = useState<{ [id: string]: EpgProgram[] }>({})
  const [loading, setLoading] = useState(false)

  const programs = channelId ? (_epgCache.get(channelId) ?? fetchedPrograms[channelId] ?? []) : []

  useEffect(() => {
    if (!channelId || _epgCache.has(channelId)) return

    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true)
    })
    fetchEpgFromRedis(channelId)
      .then((data) => {
        if (!cancelled) {
          _epgCache.set(channelId, data)
          setFetchedPrograms((prev) => ({ ...prev, [channelId]: data }))
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [channelId])

  return { programs, loading }
}

// ---- Favourites ----
const FAV_KEY = 'sl_favourites_v1'

function readFavourites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'))
  } catch { return new Set() }
}

function writeFavourites(ids: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...ids]))
}

let _favourites: Set<string> = readFavourites()
const _favListeners = new Set<() => void>()

function notifyFav() { _favListeners.forEach((fn) => fn()) }

export function useFavourites() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const rerender = () => setTick((t) => t + 1)
    _favListeners.add(rerender)

    function onStorage(e: StorageEvent) {
      if (e.key === FAV_KEY) {
        _favourites = readFavourites()
        notifyFav()
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      _favListeners.delete(rerender)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const toggle = useCallback((channelId: string) => {
    const next = new Set(_favourites)
    if (next.has(channelId)) {
      next.delete(channelId)
    } else {
      next.add(channelId)
    }
    _favourites = next
    writeFavourites(next)
    notifyFav()
  }, [])

  const isFavourite = useCallback((channelId: string) => _favourites.has(channelId), [])

  return { favouriteIds: _favourites, toggle, isFavourite }
}

// ---- Recently Watched ----
const RECENT_KEY = 'sl_recent_v1'
const RECENT_MAX = 20

function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') }
  catch { return [] }
}

let _recent: string[] = readRecent()
const _recentListeners = new Set<() => void>()
function notifyRecent() { _recentListeners.forEach((fn) => fn()) }

export function useRecent() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const rerender = () => setTick((t) => t + 1)
    _recentListeners.add(rerender)
    return () => { _recentListeners.delete(rerender) }
  }, [])

  const addRecent = useCallback((channelId: string) => {
    _recent = [channelId, ..._recent.filter((id) => id !== channelId)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(_recent))
    notifyRecent()
  }, [])

  return { recentIds: _recent, addRecent }
}
