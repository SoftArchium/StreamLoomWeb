import { useEffect, useState, useCallback } from 'react'
import {
  fetchChannels,
  fetchStreams,
  fetchCategories,
  fetchEpgChannelIds,
  fetchEpg,
} from '../api/supabase'
import type { Channel, Stream, Category, EpgProgram } from '../api/supabase'

export interface EnrichedChannel extends Channel {
  stream: Stream | undefined
  categoryIds: string[]
}

interface UseChannelsResult {
  channels: EnrichedChannel[]
  categories: Category[]
  epgChannelIds: Set<string>
  loading: boolean
  error: string | null
  refresh: () => void
}

// ---- LocalStorage cache ----
const CACHE_KEY = 'sl_catalogue_v2'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry {
  channels: EnrichedChannel[]
  categories: Category[]
  epgIds: string[]
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
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
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
      _loading = false
      notify()
      // Then refresh in background silently
      loadData(true).catch(() => {})
      return
    }
  }

  _loading = true
  notify()

  try {
    // Parallel fetch — all 4 requests fire at once
    const [rawChannels, streams, cats, epgIds] = await Promise.all([
      fetchChannels(),
      fetchStreams(),
      fetchCategories(),
      fetchEpgChannelIds(),
    ])

    const streamMap = new Map<string, Stream>()
    for (const s of streams) {
      if (s.channel_id && !streamMap.has(s.channel_id)) {
        streamMap.set(s.channel_id, s)
      }
    }

    const enriched: EnrichedChannel[] = rawChannels.map((ch) => ({
      ...ch,
      stream: streamMap.get(ch.id),
      categoryIds: ch.channel_categories.map((c) => c.category_id),
    }))

    _channels = enriched
    _categories = cats
    _epgIds = epgIds
    _loading = false
    _error = null

    writeCache({ channels: enriched, categories: cats, epgIds: [...epgIds] })
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
    return () => { _favListeners.delete(rerender) }
  }, [])

  const toggle = useCallback((channelId: string) => {
    if (_favourites.has(channelId)) {
      _favourites.delete(channelId)
    } else {
      _favourites.add(channelId)
    }
    writeFavourites(_favourites)
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
