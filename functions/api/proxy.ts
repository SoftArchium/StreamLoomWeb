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
    return new Response('Missing target url query parameter', {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    })
  }

  let parsedTarget: URL
  try {
    parsedTarget = new URL(targetUrl)
    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      return new Response('Unsupported protocol', {
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        },
      })
    }
  } catch {
    return new Response('Invalid target URL', {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    })
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

    // Inspect text if content type indicates text/m3u8 or if filename indicates m3u8
    const likelyM3U8 =
      contentType.includes('mpegurl') ||
      contentType.includes('application/x-mpegurl') ||
      contentType.includes('application/vnd.apple.mpegurl') ||
      parsedTarget.pathname.toLowerCase().endsWith('.m3u8') ||
      targetUrl.toLowerCase().includes('.m3u8')

    // If upstream responded with HTML (e.g. error page or challenge), reject rather than sending HTML to HLS
    if (contentType.includes('text/html')) {
      const htmlSnippet = await upstreamResponse.text()
      const isActuallyHtml = htmlSnippet.trimStart().toLowerCase().startsWith('<!doctype') || htmlSnippet.trimStart().toLowerCase().startsWith('<html')
      if (isActuallyHtml) {
        return new Response('Upstream returned HTML page instead of stream', {
          status: 502,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/plain',
          },
        })
      }
    }

    if (upstreamResponse.ok && (likelyM3U8 || contentType.includes('text/') || contentType === '')) {
      const originalText = await upstreamResponse.text()
      const trimmed = originalText.trimStart()

      // Confirm M3U8 via magic header
      if (trimmed.startsWith('#EXTM3U')) {
        const baseUrl = new URL(upstreamResponse.url || parsedTarget.toString())
        const proxyBase = `${urlObj.origin}${urlObj.pathname}`

        const rewrittenText = originalText
          .split('\n')
          .map((line) => {
            const lineTrimmed = line.trim()
            if (!lineTrimmed) return line
            if (lineTrimmed.startsWith('#')) {
              // Rewrite URIs in tags like #EXT-X-KEY:...,URI="..." or #EXT-X-MAP:URI="..."
              if (lineTrimmed.includes('URI="')) {
                return lineTrimmed.replace(/URI="([^"]+)"/g, (_, uri) => {
                  try {
                    const absolute = new URL(uri, baseUrl).toString()
                    return `URI="${proxyBase}?url=${encodeURIComponent(absolute)}"`
                  } catch {
                    return `URI="${uri}"`
                  }
                })
              }
              return line
            }
            // Non-comment line in M3U8 is a playlist or segment URI
            try {
              const absoluteUri = new URL(lineTrimmed, baseUrl).toString()
              return `${proxyBase}?url=${encodeURIComponent(absoluteUri)}`
            } catch {
              return line
            }
          })
          .join('\n')

        responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8')
        return new Response(rewrittenText, {
          status: upstreamResponse.status,
          headers: responseHeaders,
        })
      }

      // If text response but not EXTM3U and not video, return as-is
      return new Response(originalText, {
        status: upstreamResponse.status,
        headers: responseHeaders,
      })
    }

    // Binary media segment (.ts, .m4s, .mp4)
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
