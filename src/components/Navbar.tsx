import { NavLink } from 'react-router-dom'
import { useChannels } from '../hooks/useChannels'
import './Navbar.css'

export function Navbar() {
  const { loading, refresh } = useChannels()

  return (
    <nav className="navbar glass" role="navigation" aria-label="Main navigation">
      <div className="navbar__brand">
        <span className="navbar__logo-icon">▶</span>
        <span className="navbar__logo-text gradient-text">StreamLoom</span>
      </div>

      <div className="navbar__links">
        <NavLink to="/" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`} end>
          Home
        </NavLink>
        <NavLink to="/guide" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}>
          TV Guide
        </NavLink>
        <NavLink to="/favourites" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}>
          Favourites
        </NavLink>
      </div>

      <div className="navbar__actions">
        {loading && <span className="navbar__spinner" title="Loading catalogue…" />}
        <button
          className="navbar__icon-btn"
          onClick={refresh}
          title="Refresh catalogue"
          aria-label="Refresh"
        >
          ↻
        </button>
        <NavLink to="/settings" className="navbar__icon-btn" title="Settings" aria-label="Settings">
          ⚙
        </NavLink>
      </div>
    </nav>
  )
}
