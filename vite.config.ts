import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

function streamProxyPlugin(): Plugin {
  const handler = async (req: any, res: any) => {
    try {
      const reqUrl = new URL(req.url ?? '', `http://${req.headers.host || 'localhost'}`)
      const targetUrl = reqUrl.searchParams.get('url')

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        })
        res.end()
        return
      }

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
        res.end('Missing target url query parameter')
        return
      }

      let parsedTarget: URL
      try {
        parsedTarget = new URL(targetUrl)
        if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
          res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end('Unsupported protocol')
          return
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
        res.end('Invalid target URL')
        return
      }

      const customUa = reqUrl.searchParams.get('ua') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      const customRef = reqUrl.searchParams.get('ref') || parsedTarget.origin

      const headers: Record<string, string> = {
        'User-Agent': customUa,
        Referer: customRef,
      }
      if (req.headers.range) {
        headers.Range = req.headers.range as string
      }

      const upstream = await fetch(parsedTarget.toString(), {
        method: req.method || 'GET',
        headers,
        redirect: 'follow',
      })

      const resHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }

      upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase()
        if (!['x-frame-options', 'content-security-policy', 'transfer-encoding', 'content-encoding'].includes(lower)) {
          resHeaders[key] = value
        }
      })

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase()
      const likelyM3U8 =
        contentType.includes('mpegurl') ||
        parsedTarget.pathname.toLowerCase().endsWith('.m3u8') ||
        targetUrl.toLowerCase().includes('.m3u8')

      if (contentType.includes('text/html')) {
        const html = await upstream.text()
        if (html.trimStart().toLowerCase().startsWith('<!doctype') || html.trimStart().toLowerCase().startsWith('<html')) {
          res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end('Upstream returned HTML page instead of stream')
          return
        }
      }

      if (upstream.ok && (likelyM3U8 || contentType.includes('text/') || contentType === '')) {
        const text = await upstream.text()
        if (text.trimStart().startsWith('#EXTM3U')) {
          const baseUrl = new URL(upstream.url || parsedTarget.toString())
          const proxyBase = '/api/proxy'

          const rewritten = text
            .split('\n')
            .map((line) => {
              const t = line.trim()
              if (!t) return line
              if (t.startsWith('#')) {
                if (t.includes('URI="')) {
                  return t.replace(/URI="([^"]+)"/g, (_, uri) => {
                    try {
                      const abs = new URL(uri, baseUrl).toString()
                      return `URI="${proxyBase}?url=${encodeURIComponent(abs)}"`
                    } catch {
                      return `URI="${uri}"`
                    }
                  })
                }
                return line
              }
              try {
                const abs = new URL(t, baseUrl).toString()
                return `${proxyBase}?url=${encodeURIComponent(abs)}`
              } catch {
                return line
              }
            })
            .join('\n')

          resHeaders['Content-Type'] = 'application/vnd.apple.mpegurl; charset=utf-8'
          res.writeHead(upstream.status, resHeaders)
          res.end(rewritten)
          return
        }

        res.writeHead(upstream.status, resHeaders)
        res.end(text)
        return
      }

      res.writeHead(upstream.status, resHeaders)
      if (upstream.body) {
        const reader = upstream.body.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
      }
      res.end()
    } catch (err: any) {
      res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
      res.end(`Proxy Error: ${err.message || err}`)
    }
  }

  return {
    name: 'stream-proxy-dev',
    configureServer(server) {
      server.middlewares.use('/api/proxy', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/proxy', handler)
    },
  }
}

export default defineConfig({
  envPrefix: ['VITE_', 'SUPABASE_', 'UPSTASH_'],
  plugins: [
    react(),
    streamProxyPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'StreamLoom',
        short_name: 'StreamLoom',
        description: 'Live TV & IPTV streaming, anywhere.',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache Supabase API responses for 5 minutes
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\//i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            // Cache channel logos
            urlPattern: /\.(png|jpg|jpeg|webp|svg)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 86400 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/hls.js')) return 'vendor-hls'
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase'
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router')
          ) return 'vendor-react'
        },
      },
    },
  },
})
