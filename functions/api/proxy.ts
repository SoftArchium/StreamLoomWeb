export const onRequest: PagesFunction = async (context) => {
  const { request } = context
  const urlObj = new URL(request.url)
  const targetUrl = urlObj.searchParams.get('url')

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  if (!targetUrl) {
    return new Response('Missing target url query parameter', { status: 400 })
  }

  let parsedTarget: URL
  try {
    parsedTarget = new URL(targetUrl)
    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      return new Response('Unsupported protocol', { status: 400 })
    }
  } catch {
    return new Response('Invalid target URL', { status: 400 })
  }

  const customUa = urlObj.searchParams.get('ua') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  const customRef = urlObj.searchParams.get('ref') || parsedTarget.origin

  const headers = new Headers()
  headers.set('User-Agent', customUa)
  if (customRef) {
    headers.set('Referer', customRef)
  }
  const range = request.headers.get('Range')
  if (range) {
    headers.set('Range', range)
  }

  try {
    const upstreamResponse = await fetch(parsedTarget.toString(), {
      method: request.method,
      headers,
      redirect: 'follow',
    })

    const responseHeaders = new Headers(upstreamResponse.headers)
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', '*')
    responseHeaders.delete('X-Frame-Options')
    responseHeaders.delete('Content-Security-Policy')

    const contentType = (upstreamResponse.headers.get('content-type') || '').toLowerCase()
    const isM3U8 = contentType.includes('mpegurl') || 
                   contentType.includes('application/x-mpegurl') || 
                   parsedTarget.pathname.endsWith('.m3u8')

    if (isM3U8 && upstreamResponse.ok) {
      const originalText = await upstreamResponse.text()
      const baseUrl = new URL(upstreamResponse.url || parsedTarget.toString())
      const proxyBase = `${urlObj.origin}${urlObj.pathname}`

      const rewrittenText = originalText
        .split('\n')
        .map((line) => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) {
            if (trimmed.includes('URI="')) {
              return trimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
                const absolute = new URL(uri, baseUrl).toString()
                return `URI="${proxyBase}?url=${encodeURIComponent(absolute)}"`
              })
            }
            return line
          }
          const absoluteUri = new URL(trimmed, baseUrl).toString()
          return `${proxyBase}?url=${encodeURIComponent(absoluteUri)}`
        })
        .join('\n')

      responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
      return new Response(rewrittenText, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      })
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    })
  } catch (err: any) {
    return new Response(`Proxy Error: ${err.message || err}`, {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    })
  }
}
