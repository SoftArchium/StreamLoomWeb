import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Home } from './pages/Home'
import { Watch } from './pages/Watch'
import { Guide } from './pages/Guide'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Watch page hides the navbar (full screen) */}
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
                <Route path="*" element={<Home />} />
              </Routes>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
