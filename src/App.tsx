import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Home } from './pages/Home'
import { Guide } from './pages/Guide'
import { Favorites } from './pages/Favorites'
import { Settings } from './pages/Settings'

/*
 * The watch route is the only consumer of VideoPlayer, which pulls in hls.js
 * (~575 kB raw). Loading it on demand keeps the media engine out of the
 * initial payload so the catalogue grid can paint without waiting on it.
 */
const Watch = lazy(() => import('./pages/Watch').then((m) => ({ default: m.Watch })))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Watch page hides the navbar for an immersive full screen experience */}
        <Route
          path="/watch/:channelId"
          element={
            <Suspense fallback={<div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }} />}>
              <Watch />
            </Suspense>
          }
        />

        {/* All other pages show the navbar */}
        <Route
          path="*"
          element={
            <>
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="/favourites" element={<Favorites />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
