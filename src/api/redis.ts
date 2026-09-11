/**
 * Upstash Redis REST client — read-only.
 *
 * Mirrors the mobile app's UpstashCacheClient (ADR-0015):
 * - GET /get/<key> over HTTPS — one round-trip, no TCP pool
 * - Every failure returns null — the caller falls through to Supabase PostgREST
 * - Read-only token only — no write path is possible
 *
 * Key scheme (matches sync worker / mobile app):
 *   catalogue:meta                              → { generation, version, pages{channels,streams} }
 *   catalogue:g<N>:channels:page:<i>            → Channel[]
 *   catalogue:g<N>:streams:page:<i>             → Stream[]
 *   catalogue:g<N>:categories                   → Category[]
 */

const UPSTASH_URL = import.meta.env.VITE_UPSTASH_REDIS_REST_URL as string | undefined
const UPSTASH_TOKEN = import.meta.env.VITE_UPSTASH_REDIS_REST_READONLY_TOKEN as string | undefined

/** True when Upstash credentials are configured. */
export const isUpstashConfigured = Boolean(UPSTASH_URL && UPSTASH_TOKEN)

/** Maximum allowed response size (2 MB) — same ceiling as the mobile app. */
const MAX_BYTES = 2 * 1024 * 1024

/** Budget in ms for the entire catalogue read from Redis before we fall through. */
export const CACHE_BUDGET_MS = 20_000

/**
 * Fetches a single key from Upstash Redis via REST GET.
 * Returns the string value or null on any miss/error.
 */
export async function redisGet(key: string): Promise<string | null> {
  if (!isUpstashConfigured) return null
  try {
    const url = `${UPSTASH_URL!.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN!}` },
    })
    if (!res.ok) return null

    // Guard against oversized payloads
    const contentLength = Number(res.headers.get('content-length') ?? 0)
    if (contentLength > MAX_BYTES) return null

    const body = await res.json() as { result: string | null }
    return body.result ?? null
  } catch {
    return null
  }
}

// ---- Catalogue meta ----

/** Must match `SUPPORTED_VERSION` in the sync worker and mobile app. */
const SUPPORTED_VERSION = 2

interface CatalogueMeta {
  generation: number
  version: number
  pages: { channels: number; streams: number }
  syncedAt?: string
}

async function readMeta(): Promise<(CatalogueMeta & { prefix: string }) | null> {
  const raw = await redisGet('catalogue:meta')
  if (!raw) return null
  try {
    const meta: CatalogueMeta = JSON.parse(raw)
    if (meta.version !== SUPPORTED_VERSION || meta.generation < 0) return null
    return { ...meta, prefix: `catalogue:g${meta.generation}` }
  } catch {
    return null
  }
}

/** Reads multiple pages of a resource and concatenates them. */
async function readPages<T>(prefix: string, resource: string, pageCount: number): Promise<T[] | null> {
  if (pageCount <= 0 || pageCount > 200) return null // same backstop as mobile
  const all: T[] = []
  for (let i = 0; i < pageCount; i++) {
    const raw = await redisGet(`${prefix}:${resource}:page:${i}`)
    if (!raw) return null
    const page: T[] = JSON.parse(raw)
    all.push(...page)
  }
  return all
}

/** Reads a resource stored under a single key. */
async function readSingle<T>(prefix: string, resource: string): Promise<T[] | null> {
  const raw = await redisGet(`${prefix}:${resource}`)
  if (!raw) return null
  return JSON.parse(raw) as T[]
}

// ---- Public catalogue fetchers ----
// These match the shape the sync worker publishes.

export interface CachedChannel {
  id: string
  name: string
  logo: string | null
  country: string | null
  is_active: boolean
  channel_categories: { category_id: string }[]
}

export interface CachedStream {
  channel_id: string | null
  url: string
  quality: string | null
  status: string | null
}

export interface CachedCategory {
  id: string
  name: string
}

export interface CatalogueFromRedis {
  channels: CachedChannel[]
  streams: CachedStream[]
  categories: CachedCategory[]
}

/**
 * Attempts to load the full catalogue from Upstash Redis within CACHE_BUDGET_MS.
 * Returns null if Redis is not configured, a miss occurs, or the budget expires.
 * The caller must fall through to Supabase PostgREST on null.
 */
export async function fetchCatalogueFromRedis(): Promise<CatalogueFromRedis | null> {
  if (!isUpstashConfigured) return null

  return withBudget(async () => {
    const meta = await readMeta()
    if (!meta) return null

    const [channels, streams, categories] = await Promise.all([
      readPages<CachedChannel>(meta.prefix, 'channels', meta.pages.channels),
      readPages<CachedStream>(meta.prefix, 'streams', meta.pages.streams),
      readSingle<CachedCategory>(meta.prefix, 'categories'),
    ])

    if (!channels || !streams || !categories) return null

    return { channels, streams, categories }
  })
}

async function withBudget<T>(fn: () => Promise<T | null>): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), CACHE_BUDGET_MS)
    fn()
      .then((result) => { clearTimeout(timer); resolve(result) })
      .catch(() => { clearTimeout(timer); resolve(null) })
  })
}
