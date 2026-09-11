import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Home } from './pages/Home'
import { Watch } from './pages/Watch'
import { Guide } from './pages/Guide'
import { Favorites } from './pages/Favorites'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Watch page hides the navbar for an immersive full screen experience */}
        <Route path="/watch/:channelId" element={<Watch />} />

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
