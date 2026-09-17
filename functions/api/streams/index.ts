/**
 * Cloudflare Pages Function: /api/streams
 *
 * Probes candidate stream URLs via short Range requests and publishes the
 * verified working + dead list to two layers:
 *
 * 1. `caches.default` — per-edge-POP short-lived cache (2 h TTL) so a swarm
 *    of visitors on the same POP never re-probes.
 * 2. `ICONS_BUCKET` R2 — globally geo-replicated key-value store under
 *    `stream-verify/<channelId>.json`. Every POP can read this so the
 *    cross-colo inconsistency where channel X "works" for one user and not
 *    another is removed. The companion endpoint at
 *    `/api/streams/known/:channelId` exposes this record.
 *
 * The probe itself still runs synchronously on the first candidate (and the
 * second if the first fails) so the request returns within ~5 s of the user
 * tapping a channel. The remaining candidates are probed in the background
 * via `context.waitUntil()` and the result is published to R2.
 *
 * Honesty: a stream that is "live" from one POP can still be geo-fenced for
 * a different POP, so verification is best-effort, not a guarantee.
 */

interface EdgeStreamsPayload {
  channelId: string
  workingStream: string | null
  workingCandidates: string[]
  deadCandidates: string[]
  edgeNode: string
  timestamp: number
}

/** TTL the global R2 record advertises to clients. */
const GLOBAL_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

/** Higher score wins. Unknown resolutions rank lowest so named ones always win. */
function rankResolution(quality: string | null | undefined): number {
  if (!quality) return 0
  const q = quality.toLowerCase()
  if (q.includes('4k') || q.includes('2160') || q.includes('uhd')) return 4
  if (q.includes('1080') || q.includes('fhd') || q.includes('full hd')) return 3
  if (q.includes('720') || q.includes('hd')) return 2
  if (q.includes('576') || q.includes('480') || q.includes('360') || q.includes('sd')) return 1
  return 0
}

async function probeStreamEndpoint(url: string, timeoutMs = 2500): Promise<boolean> {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    const res = await fetch(parsed.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: parsed.origin,
        Range: 'bytes=0-2048',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timeoutId)

    if (!res.ok && res.status !== 206) {
      return false
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/html')) {
      return false
    }

    const text = await res.text()
    const trimmed = text.trimStart().toLowerCase()
    if (
      trimmed.startsWith('#extm3u') ||
      contentType.includes('mpegurl') ||
      contentType.includes('video/')
    ) {
      return true
    }

    return false
  } catch {
    return false
  }
}

export const onRequest: PagesFunction = async (context) => {
  const { request } = context
  const urlObj = new URL(request.url)

  // Global, geo-replicated verification store. Optional so the function still
  // serves when the binding is absent; the per-POP `caches.default` path below
  // is the only layer that degrades.
  // @ts-ignore -- ICONS_BUCKET is provided by the Pages binding
  const bucket = (context.env as { ICONS_BUCKET?: R2Bucket } | undefined)?.ICONS_BUCKET

  /**
   * Publishes a verification record to the global R2 store so any future
   * visitor on any POP can read it from `/api/streams/known/:channelId`.
   * Best-effort: a R2 outage must never break this endpoint.
   */
  const publishVerified = (working: string[], dead: string[]) => {
    if (!bucket) return
    if (channelId === 'unknown' || channelId === '') return
    const body = JSON.stringify({
      channelId,
      workingStream: working[0] ?? null,
      workingCandidates: working,
      deadCandidates: dead,
      verifiedAt: Date.now(),
      ttlMs: GLOBAL_TTL_MS,
    })
    const job = bucket
      .put(`stream-verify/${encodeURIComponent(channelId)}.json`, body, {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
      })
      .catch(() => {
        // R2 outages are non-fatal; the per-POP cache still serves.
      })
    if (typeof context.waitUntil === 'function') {
      context.waitUntil(job)
    }
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const channelId = urlObj.searchParams.get('channelId') || 'unknown'
  const urlsParam = urlObj.searchParams.get('urls') || ''
  const urlParams = urlObj.searchParams.getAll('url')

  // Collect and deduplicate candidate URLs
  const rawCandidateList: string[] = []
  if (urlsParam) {
    rawCandidateList.push(...urlsParam.split(',').map((u) => u.trim()))
  }
  if (urlParams.length > 0) {
    rawCandidateList.push(...urlParams.map((u) => u.trim()))
  }

  // Resolution labels arrive positionally aligned with the `urls` list.
  const qualitiesParam = urlObj.searchParams.get('qualities') || ''
  const qualitiesList = qualitiesParam ? qualitiesParam.split(',') : []
  const qualityByUrl = new Map<string, string>()
  rawCandidateList.forEach((u, i) => {
    const q = qualitiesList[i]?.trim()
    if (u.length > 0 && q && !qualityByUrl.has(u)) qualityByUrl.set(u, q)
  })

  const candidateUrls = Array.from(new Set(rawCandidateList.filter((u) => u.length > 0)))
    // Probe highest resolution first: the first working candidate wins.
    .sort((a, b) => rankResolution(qualityByUrl.get(b)) - rankResolution(qualityByUrl.get(a)))

  const cfColo = (request as any).cf?.colo || 'UNKNOWN'

  if (candidateUrls.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing candidate stream URLs' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // Check edge POP cache
  const cacheKey = `https://streamloom.internal/edge-streams/${encodeURIComponent(channelId)}`
  let edgeCache: any = null
  try {
    // @ts-ignore
    if (typeof caches !== 'undefined' && caches.default) {
      // @ts-ignore
      edgeCache = caches.default
    }
  } catch {}

  if (edgeCache) {
    try {
      const cachedResponse = await edgeCache.match(cacheKey)
      if (cachedResponse) {
        const cachedData = await cachedResponse.json()
        return new Response(JSON.stringify(cachedData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'X-Cache': 'HIT',
            'X-Edge-POP': cfColo,
          },
        })
      }
    } catch {
      // Continue to live probe on cache error
    }
  }

  // Fast synchronous probe on candidate 1
  const workingCandidates: string[] = []
  const deadCandidates: string[] = []

  const firstCandidate = candidateUrls[0]
  const firstIsWorking = await probeStreamEndpoint(firstCandidate, 2500)

  if (firstIsWorking) {
    workingCandidates.push(firstCandidate)
  } else {
    deadCandidates.push(firstCandidate)
    // Try candidate 2 synchronously if available
    if (candidateUrls.length > 1) {
      const secondCandidate = candidateUrls[1]
      const secondIsWorking = await probeStreamEndpoint(secondCandidate, 2500)
      if (secondIsWorking) {
        workingCandidates.push(secondCandidate)
      } else {
        deadCandidates.push(secondCandidate)
      }
    }
  }

  const payload: EdgeStreamsPayload = {
    channelId,
    workingStream: workingCandidates[0] || null,
    workingCandidates: [...workingCandidates],
    deadCandidates: [...deadCandidates],
    edgeNode: cfColo,
    timestamp: Date.now(),
  }

  // Populate edge cache immediately with initial sync probe result
  if (edgeCache) {
    try {
      const initialToCache = new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=7200',
          'Access-Control-Allow-Origin': '*',
        },
      })
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(edgeCache.put(cacheKey, initialToCache))
      } else {
        edgeCache.put(cacheKey, initialToCache).catch(() => {})
      }
    } catch {
      // Ignore cache storage errors
    }
  }

  // Publish the synchronous-probe result to the global R2 store so visitors
  // on a different edge POP do not re-probe and get a different answer.
  publishVerified(workingCandidates, deadCandidates)

  // Background job to probe remaining candidates and populate edge cache
  const remainingCandidates = candidateUrls.filter(
    (u) => !workingCandidates.includes(u) && !deadCandidates.includes(u)
  )

  const backgroundJob = async () => {
    for (const url of remainingCandidates) {
      const ok = await probeStreamEndpoint(url, 3000)
      if (ok) {
        if (!payload.workingCandidates.includes(url)) {
          payload.workingCandidates.push(url)
        }
        if (!payload.workingStream) {
          payload.workingStream = url
        }
      } else {
        if (!payload.deadCandidates.includes(url)) {
          payload.deadCandidates.push(url)
        }
      }
    }

    if (edgeCache) {
      try {
        const toCache = new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=7200', // 2-hour TTL at edge
            'Access-Control-Allow-Origin': '*',
          },
        })
        await edgeCache.put(cacheKey, toCache)
      } catch {
        // Ignore cache storage errors
      }
    }

    // Republish with the full set so the global store reflects the deeper
    // probe result, not just the synchronous first/second pass.
    publishVerified(payload.workingCandidates, payload.deadCandidates)
  }

  if (typeof context.waitUntil === 'function') {
    context.waitUntil(backgroundJob())
  } else {
    backgroundJob().catch(() => {})
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Cache': 'MISS',
      'X-Edge-POP': cfColo,
    },
  })
}
