import { useEffect, useState, useCallback } from 'react'
import {
  fetchChannels,
  fetchStreams,
  fetchCategories,
  fetchEpgChannelIds,
  fetchEpg,
} from '../api/supabase'
import type { Channel, Stream, Category, EpgProgram } from '../api/supabase'
import {
  fetchCatalogueFromRedis,
  isUpstashConfigured,
} from '../api/redis'

export interface EnrichedChannel extends Channel {
  stream: Stream | undefined
  streams: Stream[]
  categoryIds: string[]
}

interface UseChannelsResult {
  channels: EnrichedChannel[]
  categories: Category[]
  epgChannelIds: Set<string>
  loading: boolean
  error: string | null
  refresh: () => void
  /** Where catalogue data was last loaded from */
  source: 'redis' | 'supabase' | 'cache' | null
}

// ---- LocalStorage catalogue cache ----
const CACHE_KEY = 'sl_catalogue_v5'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// Purge legacy v4 cache if present
try {
  localStorage.removeItem('sl_catalogue_v4')
} catch {}

interface CacheEntry {
  channels: EnrichedChannel[]
  categories: Category[]
  epgIds: string[]
  source: 'redis' | 'supabase'
  ts: number
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry: CacheEntry = JSON.parse(raw)
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null
    return entry
  } catch {
    return null
  }
}

function writeCache(data: Omit<CacheEntry, 'ts'>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }))
  } catch {
    /* storage quota exceeded — ignore */
  }
}

// Module-level in-memory state (shared across all hook instances)
let _channels: EnrichedChannel[] | null = null
let _categories: Category[] | null = null
let _epgIds: Set<string> | null = null
let _loading = true
let _error: string | null = null
let _source: 'redis' | 'supabase' | 'cache' | null = null
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
}

function enrichChannels(
  rawChannels: { id: string; name: string; logo: string | null; country: string | null; is_active: boolean; channel_categories: { category_id: string }[] }[],
  streams: { channel_id: string | null; url: string; quality: string | null; status: string | null }[]
): EnrichedChannel[] {
  const streamMap = new Map<string, Stream[]>()
  for (const s of streams) {
    if (!s.channel_id) continue
    let list = streamMap.get(s.channel_id)
    if (!list) {
      list = []
      streamMap.set(s.channel_id, list)
    }
    list.push(s as Stream)
  }

  return rawChannels.map((ch) => {
    const channelStreams = streamMap.get(ch.id) || []
    // Prioritize HTTPS streams over HTTP to prevent mixed-content blocks
    const bestStream =
      channelStreams.find((s) => s.url.startsWith('https://') && s.status === 'active') ||
      channelStreams.find((s) => s.url.startsWith('https://')) ||
      channelStreams.find((s) => s.url.startsWith('http://') && s.status === 'active') ||
      channelStreams[0]

    return {
      ...(ch as Channel),
      stream: bestStream,
      streams: channelStreams,
      categoryIds: ch.channel_categories.map((c) => c.category_id),
    }
  })
}

async function loadData(force = false) {
  // Serve from memory
  if (!force && _channels) return

  // Serve from localStorage cache (instant)
  if (!force) {
    const cached = readCache()
    if (cached) {
      _channels = cached.channels
      _categories = cached.categories
      _epgIds = new Set(cached.epgIds)
      _source = 'cache'
      _loading = false
      notify()
      // Refresh in background silently
      loadData(true).catch(() => {})
      return
    }
  }

  _loading = true
  notify()

  try {
    // --- Tier 1: Try Upstash Redis first (same strategy as mobile ADR-0015) ---
    const redisResult = await fetchCatalogueFromRedis()

    if (redisResult) {
      // Redis hit — build enriched channels
      const enriched = enrichChannels(redisResult.channels, redisResult.streams)
      const cats = redisResult.categories as Category[]

      // EPG IDs still come from Supabase Storage (not in Redis)
      const epgIds = await fetchEpgChannelIds()

      _channels = enriched
      _categories = cats
      _epgIds = epgIds
      _source = 'redis'
      _loading = false
      _error = null

      writeCache({ channels: enriched, categories: cats, epgIds: [...epgIds], source: 'redis' })
      notify()
      return
    }

    // --- Tier 2: Fall through to Supabase PostgREST ---
    const [rawChannels, streams, cats, epgIds] = await Promise.all([
      fetchChannels(),
      fetchStreams(),
      fetchCategories(),
      fetchEpgChannelIds(),
    ])

    const enriched = enrichChannels(rawChannels, streams)

    _channels = enriched
    _categories = cats
    _epgIds = epgIds
    _source = 'supabase'
    _loading = false
    _error = null

    writeCache({ channels: enriched, categories: cats, epgIds: [...epgIds], source: 'supabase' })
    notify()
  } catch (e) {
    _error = (e as Error).message
    _loading = false
    notify()
  }
}

// Kick off loading immediately when the module is first imported
loadData()

export function useChannels(): UseChannelsResult {
  const [, setTick] = useState(0)

  useEffect(() => {
    const rerender = () => setTick((t) => t + 1)
    _listeners.add(rerender)
    return () => { _listeners.delete(rerender) }
  }, [])

  const refresh = useCallback(() => loadData(true), [])

  return {
    channels: _channels ?? [],
    categories: _categories ?? [],
    epgChannelIds: _epgIds ?? new Set(),
    loading: _loading,
    error: _error,
    refresh,
    source: _source,
  }
}

// ---- EPG ----
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
    fetchEpg(channelId)
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

// ---- Debug helper ----
export function getDataSource() { return _source }
export function getUpstashConfigured() { return isUpstashConfigured }
