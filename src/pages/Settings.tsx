import { useState } from 'react'
import { useChannels } from '../hooks/useChannels'
import { getBrokenCount, clearBrokenStreams } from '../util/stream'
import './Settings.css'

export function Settings() {
  const { channels, refresh } = useChannels()
  const [lowLatency, setLowLatency] = useState(() => {
    return localStorage.getItem('sl_low_latency') !== 'false'
  })
  const [autoSkip, setAutoSkip] = useState(() => {
    return localStorage.getItem('sl_auto_skip') !== 'false'
  })
  const [brokenCount, setBrokenCount] = useState(() => getBrokenCount())
  const [clearedNotice, setClearedNotice] = useState(false)
  const [clearedBrokenNotice, setClearedBrokenNotice] = useState(false)

  const handleLowLatencyChange = (enabled: boolean) => {
    setLowLatency(enabled)
    localStorage.setItem('sl_low_latency', enabled ? 'true' : 'false')
  }

  const handleAutoSkipChange = (enabled: boolean) => {
    setAutoSkip(enabled)
    localStorage.setItem('sl_auto_skip', enabled ? 'true' : 'false')
  }

  const handleClearBrokenStreams = () => {
    clearBrokenStreams()
    setBrokenCount(0)
    setClearedBrokenNotice(true)
    setTimeout(() => {
      setClearedBrokenNotice(false)
    }, 1500)
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
              <h3>Playback Engine & Resiliency</h3>
              <p>Fine-tune live video buffer, latency profile, and auto-failover</p>
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

            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Auto-Skip Unavailable Channels</strong>
                <span>Seamlessly advance to next channel if a stream errors or times out</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={autoSkip}
                  onChange={(e) => handleAutoSkipChange(e.target.checked)}
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
              <h3>Storage & Resilience Cache</h3>
              <p>Manage locally cached channels and stream health records</p>
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

            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Unavailable Channels Log</strong>
                <span>{brokenCount} unresponsive channels flagged for auto-bypass</span>
              </div>
              <button
                className="settings-btn"
                onClick={handleClearBrokenStreams}
                disabled={clearedBrokenNotice || brokenCount === 0}
              >
                {clearedBrokenNotice ? 'Reset!' : 'Reset Log'}
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
