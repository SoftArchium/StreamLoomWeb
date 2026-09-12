# StreamLoom Web — Claude Code Instructions

**StreamLoom Web** is the high-performance browser-native Progressive Web App (PWA) companion to the [StreamLoom](https://github.com/SoftArchium/streamloom) Android/TV app. It delivers full live-TV streaming and EPG guide navigation across desktop, mobile, and smart TV browsers.

---

## The Four Core Rules

1. **User experience is the most important thing.**
   - Desktop and Smart TV browsers must be supported equally.
   - Every state must be actionable: no dead ends, no infinite blank loading screens.
   - Keyboard & TV remote navigation must never drop keys or lock up.

2. **Streaming resilience is non-negotiable.**
   - Plain HTTP streams must work on HTTPS deployments without mixed-content errors.
   - Multi-stream channels must automatically shuffle to alternate candidates if a stream is dead or stalls.
   - Working streams must be cached so channels load instantly on return.

3. **Verify locally before concluding.**
   - Always run the gate: `npm run lint` (`oxlint`) and `npm run build` (`tsc -b && vite build`).
   - Zero lint errors and zero lint warnings.
   - Clean production build with no TypeScript discrepancies.

4. **Token & performance discipline.**
   - Do not serialize 11,000-channel arrays to `sessionStorage` or history state on every channel change.
   - Clean up HLS instances and event listeners on unmount.
   - Never commit `.env`, private keys, or API tokens.

---

## Quick Reference Commands

```bash
npm run dev          # Start local Vite dev server with built-in M3U8 stream proxy (default: http://localhost:5173 or 5174)
npm run build        # Typecheck and build production bundle to dist/
npm run lint         # Run oxlint (zero warnings required)
npm run preview      # Preview production build locally
```

---

## Architectural Overview

```
StreamLoomWeb/
├── functions/api/proxy.ts    # Cloudflare Pages Edge Function for M3U8 rewriting & CORS proxying
├── public/
│   ├── _headers              # Cloudflare Pages security & caching headers
│   └── _redirects            # SPA fallback (/* /index.html 200)
├── src/
│   ├── api/
│   │   ├── redis.ts          # Upstash Redis REST read-only client (ADR-0015 edge catalogue cache)
│   │   └── supabase.ts       # Supabase client (fallback catalogue, channels, streams, EPG)
│   ├── components/
│   │   ├── ChannelCard.tsx   # Channel card with thumbnail, country, resolution badges
│   │   ├── HeroSection.tsx   # Featured banner with instant playback
│   │   ├── Navbar.tsx        # Top navigation, search, and category filters
│   │   └── VideoPlayer.tsx   # HLS.js video engine, failover watchdog, TV remote navigation
│   ├── hooks/
│   │   └── useChannels.ts    # Catalogue loader, in-memory cache, working stream prioritization
│   ├── pages/
│   │   ├── Home.tsx          # Channel grid, category rails, continue watching
│   │   ├── Guide.tsx         # EPG timeline guide
│   │   ├── Watch.tsx         # Video playback route with playlist memory
│   │   └── Settings.tsx      # Low-latency toggle, broken channel reset, cache management
│   ├── util/
│   │   ├── stream.ts         # Edge proxy URL generator, working stream cache, broken stream registry
│   │   ├── country.ts        # Country code to flag/name formatting
│   │   └── shortcuts.ts      # Keyboard navigation helpers
│   └── vite.config.ts        # Vite config with dev streamProxyPlugin mirroring Cloudflare Edge Function
```

---

## Key Technical Patterns

### 1. Edge Proxy & M3U8 Rewriting
- **Problem**: Browsers on HTTPS block plain `http://` streams (mixed content); direct TLS connections to raw stream IPs fail with SSL handshake errors; stream servers omit CORS headers.
- **Solution**: Cloudflare Pages Edge Function (`functions/api/proxy.ts`) and Vite dev plugin (`vite.config.ts`) rewrite `#EXTM3U` playlists to route sub-playlists and media chunks through `/api/proxy?url=...`.
- **Crucial Rule**: When modifying text bodies in the proxy, **always delete `content-length` and `content-encoding` headers**. Otherwise, the browser cuts off the rewritten M3U8 mid-URL, resulting in `Manifest parsing error: invalid M3U8`.
- Preserve `ua` and `ref` query params on child chunk URLs for authenticated streams.

### 2. Multi-Stream Candidate Shuffling & Caching
- Channels in Supabase often provide multiple stream candidates (`channel.streams`).
- `VideoPlayer.tsx` features a **6.5s watchdog timer**:
  - If a stream stalls or errors, it tries edge proxy (if direct) or advances to the next stream candidate.
  - When a candidate works (`MANIFEST_PARSED` / `FRAG_BUFFERED`), it is cached via `cacheWorkingStream(channel.id, url, isProxied)` in `sl_working_streams_v1` (7-day TTL).
  - `enrichChannels` in `useChannels.ts` unshifts cached working streams to index 0 so subsequent visits load instantly.
  - If a cached stream fails in the future, candidate shuffling automatically finds a new working stream and updates the cache (self-healing).

### 3. Keyboard & Smart TV Navigation
- Navigation uses a single stable listener pattern with `onKeyRef` in `VideoPlayer.tsx` to ensure zero dropped keypresses.
- Keys:
  - **Previous Channel**: `ArrowLeft`, `ArrowUp`, `[`, `p`, `P`, `ChannelDown`, `PageUp`, `MediaTrackPrevious`
  - **Next Channel**: `ArrowRight`, `ArrowDown`, `]`, `n`, `N`, `ChannelUp`, `PageDown`, `MediaTrackNext`
  - **Playback**: Space (play/pause), `M` (mute), `F` (fullscreen), `Esc` / `Backspace` (exit/back).
- Custom playlists are preserved only for filtered subsets (`< 500` items) to avoid serializing giant arrays to `sessionStorage` on every keypress.

---

## Coding Guidelines

- **TypeScript**: Strict types. Use types exported from `src/api/supabase.ts` and `src/hooks/useChannels.ts`.
- **React 19**: Avoid synchronous `setState` calls directly at the root of `useEffect` (use microtasks or action-driven updates to satisfy `oxlint`).
- **Memory & Lifecycle**: Clean up `Hls` instances (`stopLoad()`, `detachMedia()`, `destroy()`) and all window timers in `useEffect` cleanups.
- **CSS**: Pure CSS with CSS variables (`src/styles/`). Use glassmorphism and modern responsive layout primitives.
