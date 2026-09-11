# StreamLoom Web

**StreamLoom Web** is the browser-native Progressive Web App (PWA) companion to the [StreamLoom](https://github.com/SoftArchium/streamloom) Android/TV app. It brings the full live-TV & EPG experience to any modern browser — installable like a native app on desktop and mobile.

🌐 **Live at:** https://streamloom.netlify.app

---

## Features

| Feature | Details |
|---|---|
| 📺 Live TV | Thousands of channels via HLS.js, with 5 Mbps fast-start and resilient retry logic |
| 📅 TV Guide (EPG) | Full 24-hour timeline, scrolled to the current time, programme click-to-watch |
| ❤️ Favourites | Pin any channel, persisted in localStorage |
| 🕘 Continue Watching | Auto-records recently watched channels |
| 🔍 Search & Filters | Search by name/country, filter by category or country, favourites-only view |
| 🎬 Video Player | Full controls: play/pause, mute, fullscreen, PiP, channel drawer, EPG overlay |
| ⌨️ Keyboard Nav | Arrow keys for channel switch, Space play/pause, F fullscreen, M mute, Esc back |
| 🌐 PWA | Install on any device, service worker caching, offline catalogue fallback |
| ⚡ Performance | Cloudflare 1.1.1.1 DoH pre-connect, 1-hour LocalStorage catalogue cache |
| ⚙️ Settings | DNS ping, low-latency mode toggle, cache management, shortcut reference |

---

## Stack

- **React 19** + **TypeScript** + **Vite 8**
- **HLS.js** for adaptive live streaming
- **Supabase** — shared backend with the mobile app (channels, streams, EPG, categories)
- **vite-plugin-pwa** + Workbox for service worker & installability
- **Cloudflare 1.1.1.1 DNS over HTTPS** pre-connected on every page load
- Deployed on **Netlify** with `netlify.toml` SPA routing

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Development

```bash
npm install
npm run dev          # starts at http://localhost:5174
npm run build        # production bundle + PWA service worker
npm run lint         # oxlint
```

---

## Deployment (Netlify)

Push to `main` — Netlify auto-deploys via `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## Related

- [StreamLoom Android/TV App](https://github.com/SoftArchium/streamloom) — the native companion app
- [SoftArchium](https://softarchium.com) — engineering & advisory
