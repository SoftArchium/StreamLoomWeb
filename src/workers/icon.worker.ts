/**
 * Channel icon lookup worker.
 *
 * Resolves a channel to a replacement logo URL using the public iptv-org
 * indexes. Those indexes hold tens of thousands of entries and several megabytes
 * of JSON, so the fetch, parse and match happen here rather than on the main
 * thread — the same reason `catalogue.worker` exists. Doing this inline froze the
 * UI and starved the guide's schedule requests.
 *
 * The worker answers with a URL (or null) only. Storing the icon stays with the
 * caller, which keeps every write in one place.
 */

const CHANNELS_INDEX = 'https://iptv-org.github.io/api/channels.json'
const LOGOS_INDEX = 'https://iptv-org.github.io/api/logos.json'

interface IptvChannel {
  id: string
  name: string
  alt_names?: string[]
  country?: string
}

interface IptvLogo {
  channel: string
  in_use?: boolean
  format?: string | null
  width?: number
  height?: number
  url: string
}

export interface IconWorkerRequest {
  channelId: string
  name: string
  country: string | null
}

export interface IconWorkerResponse {
  channelId: string
  logoUrl: string | null
}

/** iptv-org publishes the United Kingdom as `UK`; the catalogue uses `GB`. */
const COUNTRY_ALIAS: Record<string, string> = { UK: 'GB' }

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function canonCountry(code: string | null | undefined): string {
  const upper = (code || '').toUpperCase()
  return COUNTRY_ALIAS[upper] || upper
}

let byId: Map<string, IptvChannel> | null = null
let byName: Map<string, IptvChannel[]> | null = null
let logoIndex: Map<string, IptvLogo> | null = null
let loading: Promise<void> | null = null

/** Prefers in-use logos, then larger images, then common web formats. */
function logoScore(logo: IptvLogo): number {
  let score = 0
  if (logo.in_use) score += 1000
  const area = (logo.width ?? 0) * (logo.height ?? 0)
  score += Math.min(area, 1_000_000) / 1000
  const format = (logo.format || '').toUpperCase()
  if (format === 'WEBP') score += 30
  else if (format === 'PNG') score += 20
  else if (format === 'SVG') score += 10
  return score
}

/** Fetches both indexes once, tolerating either one being unavailable. */
function loadIndexes(): Promise<void> {
  if (loading) return loading

  loading = (async () => {
    try {
      const [channelsRes, logosRes] = await Promise.all([fetch(CHANNELS_INDEX), fetch(LOGOS_INDEX)])
      if (!channelsRes.ok || !logosRes.ok) return

      const channels = (await channelsRes.json()) as IptvChannel[]
      const logos = (await logosRes.json()) as IptvLogo[]

      // Ids are unique, but names are not: the same brand can exist in several
      // countries, so a name maps to a list and the country decides between them.
      const ids = new Map<string, IptvChannel>()
      const names = new Map<string, IptvChannel[]>()
      for (const ch of channels) {
        if (!ch?.id) continue
        ids.set(ch.id.toLowerCase(), ch)
        const keys = [ch.name, ...(ch.alt_names || [])]
          .map((n) => normalizeName(n || ''))
          .filter(Boolean)
        for (const key of keys) {
          const list = names.get(key)
          if (list) {
            if (!list.includes(ch)) list.push(ch)
          } else {
            names.set(key, [ch])
          }
        }
      }

      // Best logo per channel: an in-use one, then the largest image.
      const best = new Map<string, IptvLogo>()
      for (const logo of logos) {
        if (!logo?.url || !logo.channel) continue
        const key = logo.channel.toLowerCase()
        const current = best.get(key)
        if (!current || logoScore(logo) > logoScore(current)) best.set(key, logo)
      }

      byId = ids
      byName = names
      logoIndex = best
    } catch {
      // Leave the indexes null: the placeholder stays and nothing is retried.
    }
  })()

  return loading
}

/**
 * Resolves one channel to a logo URL.
 *
 * An id match is authoritative. A name match is accepted only when it is unique
 * or agrees on country — the same brand exists in many countries, and storing the
 * wrong one's logo is worse than leaving the placeholder.
 */
function resolve(channelId: string, name: string, country: string | null): string | null {
  if (!byId || !byName || !logoIndex) return null

  let candidate = byId.get(channelId.toLowerCase())

  if (!candidate) {
    const list = byName.get(normalizeName(name)) || []
    if (list.length === 0) return null

    if (country) {
      const want = canonCountry(country)
      candidate = list.find((c) => canonCountry(c.country) === want)
      if (!candidate) return null
    } else {
      if (list.length > 1) return null
      candidate = list[0]
    }
  }

  return logoIndex.get(candidate.id.toLowerCase())?.url ?? null
}

// Typed via a narrow local shape so this file needs no webworker lib reference.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<IconWorkerRequest>) => void) | null
  postMessage: (message: IconWorkerResponse) => void
}

ctx.onmessage = async (event: MessageEvent<IconWorkerRequest>) => {
  const { channelId, name, country } = event.data
  await loadIndexes()
  ctx.postMessage({ channelId, logoUrl: resolve(channelId, name, country) })
}