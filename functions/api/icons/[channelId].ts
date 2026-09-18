/**
 * Cloudflare Pages Function: /api/icons/:channelId
 *
 * Channel icon storage backed by the `channel-icons` R2 bucket. The bracketed
 * filename maps the sub-path to `params.channelId`.
 *
 * The client renders icons from `icons.softarchium.com` first. When that CDN has
 * no object for a channel, the client resolves a replacement asynchronously and
 * posts it here, which is the only place an icon is ever written.
 *
 * Routes:
 *   GET  /api/icons/:channelId  -> serve the stored icon, or 404
 *   POST /api/icons/:channelId  -> fetch { url } and store it, or 400
 *
 * Objects are keyed by channel id alone so the same icon is shared by every
 * visitor regardless of which edge POP resolved it.
 */

/** Object key inside the bucket for a channel. */
function iconKey(channelId: string): string {
  return `icons/${channelId}.webp`
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Max-Age': '86400',
  }
}

/** Image content types accepted for storage, keyed by the declared format. */
const ALLOWED_TYPES = new Set([
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/gif',
  'image/avif',
  'image/apng',
])

/** Ceiling for a downloaded icon, so a bad URL cannot fill the bucket. */
const MAX_ICON_BYTES = 512 * 1024

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context
  const urlObj = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  // The route is /api/icons/:channelId; the wildcard also tolerates the id
  // arriving as a trailing query value during local development.
  const rawParam = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId
  const channelId = normalizeChannelId(rawParam ?? urlObj.searchParams.get('channelId') ?? undefined)

  if (!channelId) {
    return new Response('Invalid channel id', { status: 400, headers: corsHeaders() })
  }

  // Binding is optional so the site still serves if it is unset.
  // @ts-ignore -- ICONS_BUCKET is provided by the Pages binding
  const bucket = (context.env as { ICONS_BUCKET?: unknown } | undefined)?.ICONS_BUCKET as
    | { put: (k: string, v: string, opts?: { httpMetadata?: { contentType?: string } }) => Promise<unknown> }
    | undefined
  if (!bucket) {
    return new Response('Icon storage is not configured', { status: 503, headers: corsHeaders() })
  }

  const key = iconKey(channelId)

  // ---- Read ----
  if (request.method === 'GET' || request.method === 'HEAD') {
    const object = await bucket.get(key)
    if (!object) {
      return new Response('Not found', { status: 404, headers: corsHeaders() })
    }

    const headers = new Headers(corsHeaders())
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('ETag', object.httpEtag)
    if (object.size) headers.set('Content-Length', String(object.size))

    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers })
  }

  // ---- Write ----
  if (request.method === 'POST') {
    let body: { url?: unknown }
    try {
      body = await request.json()
    } catch {
      return new Response('Expected a JSON body', { status: 400, headers: corsHeaders() })
    }

    const sourceUrl = typeof body.url === 'string' ? body.url.trim() : ''
    if (!sourceUrl) {
      return new Response('Missing url', { status: 400, headers: corsHeaders() })
    }

    let parsed: URL
    try {
      parsed = new URL(sourceUrl)
    } catch {
      return new Response('Invalid url', { status: 400, headers: corsHeaders() })
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return new Response('Unsupported url protocol', { status: 400, headers: corsHeaders() })
    }

    // An icon already stored is authoritative — never re-fetch or overwrite.
    const existing = await bucket.head(key)
    if (existing) {
      return new Response(JSON.stringify({ stored: false, url: `/api/icons/${channelId}` }), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
      })
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/*',
        },
        redirect: 'follow',
      })

      if (!upstream.ok) {
        return new Response('Upstream icon unavailable', { status: 502, headers: corsHeaders() })
      }

      const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!ALLOWED_TYPES.has(contentType)) {
        return new Response('Unsupported image type', { status: 415, headers: corsHeaders() })
      }

      const buffer = await upstream.arrayBuffer()
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_ICON_BYTES) {
        return new Response('Icon rejected by size limits', { status: 413, headers: corsHeaders() })
      }

      await bucket.put(key, buffer, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      })

      return new Response(JSON.stringify({ stored: true, url: `/api/icons/${channelId}` }), {
        status: 200,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' },
      })
    } catch {
      return new Response('Failed to store icon', { status: 502, headers: corsHeaders() })
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders() })
}
