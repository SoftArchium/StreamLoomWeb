import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.tsx'

// The boot shell inside #root (see index.html) lets the page paint its nav and
// rails from HTML alone while the bundle loads. React replaces it on first
// commit, so there is no blank frame and no layout shift.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
