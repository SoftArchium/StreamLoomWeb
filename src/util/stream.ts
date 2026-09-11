/**
 * Stream utility helpers for protocol resolution, CORS proxy routing,
 * and broken-stream state management.
 */

const BROKEN_STREAMS_KEY = 'sl_broken_streams_v1'
const BROKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

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

export function isStreamBroken(channelId: string): boolean {
  const map = getBrokenMap()
  return Boolean(map[channelId])
}

export function markStreamBroken(channelId: string) {
  try {
    const map = getBrokenMap()
    map[channelId] = { timestamp: Date.now() }
    localStorage.setItem(BROKEN_STREAMS_KEY, JSON.stringify(map))
  } catch {
    // ignore quota
  }
}

export function unmarkStreamBroken(channelId: string) {
  try {
    const map = getBrokenMap()
    delete map[channelId]
    localStorage.setItem(BROKEN_STREAMS_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}

export function getBrokenCount(): number {
  return Object.keys(getBrokenMap()).length
}

export function clearBrokenStreams() {
  try {
    localStorage.removeItem(BROKEN_STREAMS_KEY)
  } catch {
    // ignore
  }
}

/**
 * Builds the proxy URL for a given stream endpoint.
 */
export function getProxyStreamUrl(rawUrl: string, userAgent?: string | null, referrer?: string | null): string {
  const params = new URLSearchParams()
  params.set('url', rawUrl)
  if (userAgent) params.set('ua', userAgent)
  if (referrer) params.set('ref', referrer)
  return `/api/proxy?${params.toString()}`
}

/**
 * Checks if the current page protocol is HTTPS while the stream is HTTP.
 */
export function isMixedContent(url: string): boolean {
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'https:' && url.startsWith('http://')
}
