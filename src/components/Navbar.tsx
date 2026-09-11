import { NavLink } from 'react-router-dom'
import './Navbar.css'

export function Navbar() {
  return (
    <nav className="navbar glass" role="navigation" aria-label="Main navigation">
      <div className="navbar__brand">
        <span className="navbar__logo-icon">▶</span>
        <span className="navbar__logo-text gradient-text">StreamLook</span>
      </div>
      <div className="navbar__links">
        <NavLink to="/" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`} end>
          Home
        </NavLink>
        <NavLink to="/guide" className={({ isActive }) => `navbar__link ${isActive ? 'navbar__link--active' : ''}`}>
          TV Guide
        </NavLink>
      </div>
    </nav>
  )
}
