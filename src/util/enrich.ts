import type { Channel, EnrichedChannel, Stream } from '../api/types'

/** Working-stream cache entry, passed in so this stays free of browser storage. */
export interface WorkingRecord {
  url: string
  useProxy: boolean
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
    const workingCandidate = cachedWorking
      ? channelStreams.find((s) => s.url === cachedWorking.url)
      : null

    let orderedStreams = channelStreams
    if (workingCandidate) {
      orderedStreams = [
        workingCandidate,
        ...channelStreams.filter((s) => s.url !== workingCandidate.url),
      ]
    }

    // Prefer the known-good stream, then active HTTPS, HTTPS, active HTTP, first
    const bestStream =
      workingCandidate ||
      orderedStreams.find((s) => s.url.startsWith('https://') && s.status === 'active') ||
      orderedStreams.find((s) => s.url.startsWith('https://')) ||
      orderedStreams.find((s) => s.url.startsWith('http://') && s.status === 'active') ||
      orderedStreams[0]

    if (bestStream && orderedStreams.length > 1) {
      orderedStreams = [
        bestStream,
        ...orderedStreams.filter((s) => s.url !== bestStream.url),
      ]
    }

    return {
      ...ch,
      stream: bestStream,
      streams: orderedStreams,
      categoryIds: ch.channel_categories.map((c) => c.category_id),
    }
  })
}
