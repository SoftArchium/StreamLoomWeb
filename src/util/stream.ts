/**
 * Stream utility helpers for protocol resolution, CORS proxy routing,
 * and broken-stream state management.
 */

const BROKEN_STREAMS_KEY = 'sl_broken_streams_v2'
const BROKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Invalidate and purge legacy v1 cache to unblock falsely marked channels
try {
  localStorage.removeItem('sl_broken_streams_v1')
} catch {}

interface BrokenRecord {
  timestamp: number
}

function getBrokenMap(): Record<string, BrokenRecord> {
  try {
    const raw = localStorage.getItem(BROKEN_STREAMS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, BrokenRecord>
    const now = Date.now()
    const valid: Record<string, BrokenRecord> = {}
    for (const [id, rec] of Object.entries(parsed)) {
      if (now - rec.timestamp < BROKEN_TTL_MS) {
        valid[id] = rec
      }
    }
    return valid
  } catch {
    return {}
  }
}

const HIDE_BROKEN_KEY = 'sl_hide_broken'

let _cachedHideBroken: boolean | null = null
let _cachedBrokenSet: Set<string> | null = null
const _streamListeners = new Set<() => void>()

export function onStreamStateChange(listener: () => void): () => void {
  _streamListeners.add(listener)
  return () => {
    _streamListeners.delete(listener)
  }
}

export function notifyStreamStateChange() {
  _streamListeners.forEach((fn) => {
    try {
      fn()
    } catch {}
  })
}

export function isHideBrokenStreamsEnabled(): boolean {
  if (_cachedHideBroken !== null) return _cachedHideBroken
  try {
    _cachedHideBroken = localStorage.getItem(HIDE_BROKEN_KEY) !== 'false'
  } catch {
    _cachedHideBroken = true
  }
  return _cachedHideBroken
}

export function setHideBrokenStreamsEnabled(enabled: boolean) {
  _cachedHideBroken = enabled
  try {
    localStorage.setItem(HIDE_BROKEN_KEY, enabled ? 'true' : 'false')
  } catch {}
  notifyStreamStateChange()
}

const AUTO_SKIP_KEY = 'sl_auto_skip'
let _cachedAutoSkip: boolean | null = null

export function isAutoSkipEnabled(): boolean {
  if (_cachedAutoSkip !== null) return _cachedAutoSkip
  try {
    _cachedAutoSkip = localStorage.getItem(AUTO_SKIP_KEY) === 'true'
  } catch {
    _cachedAutoSkip = false
  }
  return _cachedAutoSkip
}

export function setAutoSkipEnabled(enabled: boolean) {
  _cachedAutoSkip = enabled
  try {
    localStorage.setItem(AUTO_SKIP_KEY, enabled ? 'true' : 'false')
  } catch {}
  notifyStreamStateChange()
}

export function getBrokenSet(): Set<string> {
  if (_cachedBrokenSet) return _cachedBrokenSet
  const map = getBrokenMap()
  _cachedBrokenSet = new Set(Object.keys(map))
  return _cachedBrokenSet
}

export function isStreamBroken(channelId: string): boolean {
  return getBrokenSet().has(channelId)
}

export function markStreamBroken(channelId: string) {
  try {
    const map = getBrokenMap()
    map[channelId] = { timestamp: Date.now() }
    localStorage.setItem(BROKEN_STREAMS_KEY, JSON.stringify(map))
    _cachedBrokenSet = null
    notifyStreamStateChange()
  } catch {
    // ignore quota
  }
}

export function unmarkStreamBroken(channelId: string) {
  try {
    const map = getBrokenMap()
    if (map[channelId]) {
      delete map[channelId]
      localStorage.setItem(BROKEN_STREAMS_KEY, JSON.stringify(map))
      _cachedBrokenSet = null
      notifyStreamStateChange()
    }
  } catch {
    // ignore
  }
}

export function getBrokenCount(): number {
  return getBrokenSet().size
}

export function clearBrokenStreams() {
  try {
    localStorage.removeItem(BROKEN_STREAMS_KEY)
    localStorage.removeItem('sl_broken_streams_v1')
    _cachedBrokenSet = null
    notifyStreamStateChange()
  } catch {
    // ignore
  }
}

// ---- Verified Working Streams Cache ----
const WORKING_STREAMS_KEY = 'sl_working_streams_v1'
const WORKING_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface WorkingStreamRecord {
  url: string
  useProxy: boolean
  timestamp: number
}

function getWorkingMap(): Record<string, WorkingStreamRecord> {
  try {
    const raw = localStorage.getItem(WORKING_STREAMS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, WorkingStreamRecord>
    const now = Date.now()
    const valid: Record<string, WorkingStreamRecord> = {}
    for (const [id, rec] of Object.entries(parsed)) {
      if (now - rec.timestamp < WORKING_TTL_MS) {
        valid[id] = rec
      }
    }
    return valid
  } catch {
    return {}
  }
}

export function getCachedWorkingStream(channelId: string): { url: string; useProxy: boolean } | null {
  const map = getWorkingMap()
  const rec = map[channelId]
  if (!rec) return null
  return { url: rec.url, useProxy: rec.useProxy }
}

export function cacheWorkingStream(channelId: string, url: string, useProxy = false) {
  try {
    const map = getWorkingMap()
    map[channelId] = { url, useProxy, timestamp: Date.now() }
    localStorage.setItem(WORKING_STREAMS_KEY, JSON.stringify(map))
  } catch {
    // ignore quota
  }
}

export function clearWorkingStreams() {
  try {
    localStorage.removeItem(WORKING_STREAMS_KEY)
  } catch {
    // ignore
  }
}

export interface EdgeStreamCheckResult {
  channelId: string
  workingStream: string | null
  workingCandidates: string[]
  deadCandidates: string[]
  edgeNode?: string
  timestamp: number
}

/**
 * Probes candidate stream URLs via edge node (/api/streams)
 * Returns pre-filtered working and dead stream candidates.
 */
export async function fetchEdgeVerifiedStreams(
  channelId: string,
  candidateUrls: string[],
  timeoutMs = 3000
): Promise<EdgeStreamCheckResult | null> {
  if (!candidateUrls || candidateUrls.length === 0) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const params = new URLSearchParams()
    params.set('channelId', channelId)
    params.set('urls', candidateUrls.join(','))

    const res = await fetch(`/api/streams?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = (await res.json()) as EdgeStreamCheckResult
    return data
  } catch {
    return null
  }
}

/**
 * Builds the proxy URL for a given stream endpoint.
 * Protects against double-proxying and appends multi-candidate fallbacks.
 */
export function getProxyStreamUrl(
  rawUrl: string,
  userAgent?: string | null,
  referrer?: string | null,
  fallbacks?: string[],
  channelId?: string
): string {
  if (!rawUrl) return ''
  if (rawUrl.startsWith('/api/proxy') || rawUrl.includes('/api/proxy?url=')) {
    return rawUrl
  }
  const params = new URLSearchParams()
  params.set('url', rawUrl)
  if (userAgent) params.set('ua', userAgent)
  if (referrer) params.set('ref', referrer)
  if (fallbacks && fallbacks.length > 0) {
    for (const fb of fallbacks) {
      if (fb && fb !== rawUrl) {
        params.append('fallback', fb)
      }
    }
  }
  if (channelId) {
    params.set('channelId', channelId)
  }
  return `/api/proxy?${params.toString()}`
}

/**
 * Checks if the current page protocol is HTTPS while the stream is HTTP.
 */
export function isMixedContent(url: string): boolean {
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'https:' && url.startsWith('http://')
}

/**
 * Upgrades http:// to https://
 */
export function tryUpgradeToHttps(url: string): string {
  if (url.startsWith('http://')) {
    return url.replace(/^http:\/\//i, 'https://')
  }
  return url
}

/**
 * Checks if a response payload is HTML (e.g. SPA index.html returned by unconfigured proxy).
 */
export function isHtmlResponse(text: string): boolean {
  if (!text) return false
  const trimmed = text.trimStart().toLowerCase()
  return (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head') ||
    trimmed.startsWith('<body')
  )
}
