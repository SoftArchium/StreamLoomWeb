import { useState } from 'react'
import { useChannels } from '../hooks/useChannels'
import './Settings.css'

export function Settings() {
  const { channels, refresh } = useChannels()
  const [lowLatency, setLowLatency] = useState(() => {
    return localStorage.getItem('sl_low_latency') !== 'false'
  })
  const [clearedNotice, setClearedNotice] = useState(false)

  const handleLowLatencyChange = (enabled: boolean) => {
    setLowLatency(enabled)
    localStorage.setItem('sl_low_latency', enabled ? 'true' : 'false')
  }

  const handleClearCache = () => {
    try {
      localStorage.removeItem('sl_catalogue_v4')
      localStorage.removeItem('sl_catalogue_v3')
      localStorage.removeItem('sl_catalogue_v2')
      localStorage.removeItem('sl_recent_v1')
      sessionStorage.removeItem('sl_active_playlist')
      setClearedNotice(true)
      setTimeout(() => {
        setClearedNotice(false)
        refresh()
      }, 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="page-wrapper settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Settings</h1>
        <p className="settings-page__subtitle">Playback preferences, storage management, and shortcuts</p>
      </div>

      <div className="settings-grid">
        {/* Playback Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">🎬</span>
            <div>
              <h3>Playback Engine</h3>
              <p>Fine-tune live video buffer and latency profile</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Ultra-Low Latency Mode</strong>
                <span>Synchronize directly with live edge broadcasts for minimal delay</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={lowLatency}
                  onChange={(e) => handleLowLatencyChange(e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </section>

        {/* Cache & Storage Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">💾</span>
            <div>
              <h3>Storage & Offline Cache</h3>
              <p>Manage locally cached channels and playlists</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Cached Channels</strong>
                <span>{channels.length} channels loaded & indexed locally</span>
              </div>
              <button
                className="settings-btn settings-btn--danger"
                onClick={handleClearCache}
                disabled={clearedNotice}
              >
                {clearedNotice ? 'Cleared!' : 'Clear Cache'}
              </button>
            </div>
          </div>
        </section>

        {/* Keyboard & Remote Controls Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">⌨️</span>
            <div>
              <h3>Keyboard & Remote Shortcuts</h3>
              <p>Effortless navigation for desktop, trackpad, and TV remotes</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="shortcut-list">
              <div className="shortcut-item">
                <kbd>←</kbd> <kbd>→</kbd>
                <span>Navigate Channels in Grid / Row</span>
              </div>
              <div className="shortcut-item">
                <kbd>↑</kbd> <kbd>↓</kbd>
                <span>Switch Rows / Categories</span>
              </div>
              <div className="shortcut-item">
                <kbd>[</kbd> <kbd>]</kbd>
                <span>Previous / Next Channel in Player</span>
              </div>
              <div className="shortcut-item">
                <kbd>Enter</kbd>
                <span>Play Selected Channel</span>
              </div>
              <div className="shortcut-item">
                <kbd>/</kbd>
                <span>Quick Focus Search</span>
              </div>
              <div className="shortcut-item">
                <kbd>Space</kbd>
                <span>Play / Pause</span>
              </div>
              <div className="shortcut-item">
                <kbd>F</kbd>
                <span>Toggle Fullscreen</span>
              </div>
              <div className="shortcut-item">
                <kbd>M</kbd>
                <span>Toggle Mute</span>
              </div>
              <div className="shortcut-item">
                <kbd>Esc</kbd>
                <span>Clear Filters / Back</span>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">👤</span>
            <div>
              <h3>About</h3>
              <p>Application and creator information</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="about-details">
              <p style={{ fontSize: '1.05rem' }}>
                <strong>Author:</strong>{' '}
                <a
                  href="https://www.linkedin.com/in/surajchavda/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--accent)',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    textUnderlineOffset: '3px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Suraj Chavda ↗
                </a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
