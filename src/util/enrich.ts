import type { Channel, EnrichedChannel, Stream } from '../api/types'
import { orderStreamsForPlayback } from './resolution'

/** Working-stream cache entry, passed in so this stays free of browser storage. */
export interface WorkingRecord {
  url: string
  useProxy: boolean
  quality?: string | null
}

/**
 * Joins raw channels with their stream candidates and category ids.
 *
 * Pure and storage-free so it can run inside a Web Worker as well as on the
 * main thread. The working-stream map is supplied by the caller instead of being
 * read from localStorage per channel, which is what made this loop expensive.
 */
export function enrichChannels(
  rawChannels: Channel[],
  streams: Stream[],
  working: Record<string, WorkingRecord>
): EnrichedChannel[] {
  const streamMap = new Map<string, Stream[]>()
  for (const s of streams) {
    if (!s.channel_id) continue
    let list = streamMap.get(s.channel_id)
    if (!list) {
      list = []
      streamMap.set(s.channel_id, list)
    }
    list.push(s)
  }

  return rawChannels.map((ch) => {
    const channelStreams = streamMap.get(ch.id) || []
    const cachedWorking = working[ch.id]

    // Highest resolution first, with the cached working stream promoted only when
    // no better resolution is available for this channel.
    const orderedStreams = orderStreamsForPlayback(channelStreams, cachedWorking?.url)

    return {
      ...ch,
      stream: orderedStreams[0],
      streams: orderedStreams,
      categoryIds: ch.channel_categories.map((c) => c.category_id),
    }
  })
}
