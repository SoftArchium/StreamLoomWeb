import { useEffect, useState } from 'react'
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
}

let _cachedChannels: EnrichedChannel[] | null = null
let _cachedCategories: Category[] | null = null
let _cachedEpgIds: Set<string> | null = null

export function useChannels(): UseChannelsResult {
  const [channels, setChannels] = useState<EnrichedChannel[]>(_cachedChannels ?? [])
  const [categories, setCategories] = useState<Category[]>(_cachedCategories ?? [])
  const [epgChannelIds, setEpgChannelIds] = useState<Set<string>>(_cachedEpgIds ?? new Set())
  const [loading, setLoading] = useState(!_cachedChannels)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (_cachedChannels) return
    let cancelled = false

    async function load() {
      try {
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

        if (!cancelled) {
          _cachedChannels = enriched
          _cachedCategories = cats
          _cachedEpgIds = epgIds
          setChannels(enriched)
          setCategories(cats)
          setEpgChannelIds(epgIds)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { channels, categories, epgChannelIds, loading, error }
}

export function useEpg(channelId: string | null) {
  const [programs, setPrograms] = useState<EpgProgram[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!channelId) { setPrograms([]); return }
    let cancelled = false
    setLoading(true)
    fetchEpg(channelId).then((data) => {
      if (!cancelled) { setPrograms(data); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [channelId])

  return { programs, loading }
}
