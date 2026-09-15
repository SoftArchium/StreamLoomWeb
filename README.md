# StreamLoom Web

**StreamLoom Web** is the high-performance browser-native Progressive Web App (PWA) companion to the [StreamLoom](https://github.com/SoftArchium/streamloom) Android/TV app. It brings the full live-TV & EPG experience to any modern browser — installable like a native app on desktop, mobile, and smart TVs.

---

## Features

| Feature | Details |
|---|---|
| 📺 Live TV | Thousands of channels via HLS.js, resolution-first stream selection, 5 Mbps fast-start buffer, resilient stream retries |
| 📅 TV Guide (EPG) | Virtualized timeline grid anchored to now, channel search, faceted filters, one-click English translation of programme titles |
| ❤️ Favourites | Pin channels with persistent local storage |
| 🕘 Continue Watching | Auto-records recently watched channels |
| 🎯 Mobile Filter Parity | Priority categories (Music 🎵, Movies 🎬, Cartoons 🦄, Comedy 😂, News 📰, Sports ⚽), Resolution filter (4K, FHD, HD, SD), and Country picker |
| ⌨️ TV & Desktop Nav | Arrow keys for channel/row navigation, Enter to play, `/` to search, Esc to clear/back, Space, F, M |
| 🖱️ Trackpad & Mouse | 2-finger horizontal trackpad inertia, mouse wheel horizontal category scroll, card hover states |
| ⚡ Edge Performance | Cloudflare Pages Anycast edge distribution, Upstash Redis caching (ADR-0015) |
| 🌐 PWA | Installable on any device, background service worker precaching, offline catalogue fallback |
| ⚙️ Settings | Data source indicators, low-latency mode toggle, cache management, shortcut reference |

---

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **HLS.js** for adaptive live streaming
- **Cloudflare Pages** for global Anycast edge delivery
- **Upstash Redis** read-only edge cache (ADR-0015) — the browser only data source
- **Supabase** — backend source of truth, synced into Redis (never called from the browser)
- **vite-plugin-pwa** + Workbox for service worker & installability

---

## Redis data contract

The browser reads only from Upstash Redis (ADR-0015). Supabase is never
called from the client; the sync worker publishes into Redis and the app
reads it back.

- catalogue:meta                    -> { generation, version, pages }
- catalogue:g<N>:channels:page:<i>  -> Channel[]
- catalogue:g<N>:streams:page:<i>   -> Stream[]
- catalogue:g<N>:categories         -> Category[]
- catalogue:g<N>:epg:ids            -> string[]      (channel ids with schedules)
- catalogue:g<N>:epg:<channelId>    -> EpgProgram[]  (per-channel schedule)

Each Channel carries languages as ISO 639-2 codes (e.g. [eng, hin]).
The sync worker already publishes this field; when a generation omits it the Language filter hides itself rather than showing an empty control.

Every key shares the generation prefix from catalogue:meta, so bumping the
generation invalidates the catalogue and EPG together. Page counts in meta
decide how many channels/streams pages are read, and they are fetched
concurrently.

## Environment Variables


Copy `.env.example` to `.env`:

```bash
VITE_UPSTASH_REDIS_REST_URL=https://your-upstash-endpoint.upstash.io
VITE_UPSTASH_REDIS_REST_READONLY_TOKEN=your_upstash_readonly_token
```

Both are required — without them the app has no catalogue to read.

### Optional: TV Guide translation

The Guide's `English` toggle translates programme titles. Point it at a
LibreTranslate-compatible endpoint; without one it falls back to the public
MyMemory API, which is rate limited.

```bash
VITE_TRANSLATE_URL=https://your-libretranslate.example.com/translate
VITE_TRANSLATE_API_KEY=            # only if the endpoint requires a key
```

Translations are cached in memory and in localStorage, requests are debounced
and batched, and only titles that look non-English are sent at all.

---

## Development

```bash
npm install
npm run dev          # starts at http://localhost:5174
npm run build        # production build to dist/
npm run lint         # oxlint
```

---

## Cloudflare Pages Deployment

StreamLoom Web is pre-configured for Cloudflare Pages:
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Node version:** `>= 20`
- SPA routing handled automatically via `public/_redirects` (`/* /index.html 200`)
- Edge caching and security headers defined in `public/_headers`
