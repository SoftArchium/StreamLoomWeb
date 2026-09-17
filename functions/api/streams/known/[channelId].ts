/**
 * Cloudflare Pages Function: /api/streams/known/:channelId
 *
 * Returns the global stream-verification record for a channel, if one exists.
 *
 * The companion probe endpoint at `/api/streams` runs candidate-by-candidate
 * Range requests against upstream HLS endpoints and writes the verified
 * working + dead candidates to the `channel-icons` R2 bucket (keyed by
 * channel id). This endpoint reads that record back so any visitor, on any
 * edge POP, sees the same verified truth instead of re-probing and possibly
 * getting a different answer because of POP-specific network reachability.
 *
 * The R2 bucket is the same one used by `/api/icons`; it is geo-replicated
 * by Cloudflare so reads are consistent across POPs. Writes from `/api/streams`
 * are eventually consistent (typically within a few seconds), which is fine
 * for verification data whose worst-case staleness is capped by the periodic
 * client-side re-validation loop.
 *
 * Routes:
 *   GET /api/streams/known/:channelId  -> verified record, or 404
 *
 * Response shape matches `EdgeStreamsPayload` from `/api/streams/index.ts`
 * (minus the `edgeNode` field, since the record is global).
 */

interface KnownStreamPayload {
  channelId: string
  workingStream: string | null
  workingCandidates: string[]
  deadCandidates: string[]
  verifiedAt: number
  /** TTL in milliseconds; clients should re-probe past this age. */
  ttlMs: number
}

/** Channel ids become path segments, so only safe characters are accepted. */
function normalizeChannelId(raw: string | undefined): string | null {
  if (!raw) return null
  let id: string
  try {
    id = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(id)) return null
  return id
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'public, max-age=60',
  }
}

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context
  const urlObj = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const rawParam = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId
  const channelId = normalizeChannelId(rawParam ?? urlObj.searchParams.get('channelId') ?? undefined)
  if (!channelId) {
    return new Response('Invalid channel id', { status: 400, headers: corsHeaders() })
  }

  // Binding is optional so the site still serves if it is unset.
  // @ts-ignore -- ICONS_BUCKET is provided by the Pages binding
  const bucket = (context.env as { ICONS_BUCKET?: R2Bucket } | undefined)?.ICONS_BUCKET
  if (!bucket) {
    return new Response('Stream verification store is not configured', { status: 503, headers: corsHeaders() })
  }

  const key = `stream-verify/${channelId}.json`

  if (request.method === 'GET' || request.method === 'HEAD') {
    const object = await bucket.get(key)
    if (!object) {
      return new Response('Not found', { status: 404, headers: corsHeaders() })
    }

    // Cheap freshness check via the If-Modified-Since header so a swarm of
    // clients re-fetching the same channel does not re-download the body.
    const ifModifiedSince = request.headers.get('If-Modified-Since')
    if (ifModifiedSince) {
      const since = Date.parse(ifModifiedSince)
      if (!Number.isNaN(since) && object.uploaded.getTime() <= since) {
        return new Response(null, { status: 304, headers: corsHeaders() })
      }
    }

    const headers = new Headers(corsHeaders())
    headers.set('Content-Type', 'application/json; charset=utf-8')
    headers.set('Last-Modified', object.uploaded.toUTCString())
    if (object.size) headers.set('Content-Length', String(object.size))

    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers })
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders() })
}

// Exported for `index.ts` so the write side uses the same shape.
export type { KnownStreamPayload }
