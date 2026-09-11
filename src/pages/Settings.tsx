import { useState } from 'react'
import { useChannels } from '../hooks/useChannels'
import { isUpstashConfigured } from '../api/redis'
import './Settings.css'

export function Settings() {
  const { channels, refresh, source } = useChannels()
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
        <p className="settings-page__subtitle">Configure playback, edge performance, and application preferences</p>
      </div>

      <div className="settings-grid">
        {/* Edge Network Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">⚡</span>
            <div>
              <h3>Cloudflare Edge Acceleration</h3>
              <p>Ultra-low latency edge network & asset distribution</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Hosting Infrastructure</strong>
                <span>Cloudflare Pages Global Anycast Edge Network</span>
              </div>
              <span className="badge badge--success">✓ Cloudflare Edge</span>
            </div>

            <div className="settings-badge-row">
              <span className="badge badge--success">✓ HTTP/3 QUIC Acceleration</span>
              <span className="badge badge--success">✓ Edge Asset Pre-caching</span>
              <span className="badge badge--success">✓ Zero Cold Start</span>
            </div>
          </div>
        </section>

        {/* Video Player Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">🎬</span>
            <div>
              <h3>Playback & HLS Engine</h3>
              <p>Fine-tune live video buffer and latency profile</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Ultra-Low Latency Mode</strong>
                <span>Synchronize directly with live edge broadcasts</span>
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
                <strong>Initial Bitrate Estimate</strong>
                <span>5 Mbps fast-start estimation for zero-buffer frame start</span>
              </div>
              <span className="badge badge--info">5.0 Mbps FastStart</span>
            </div>
          </div>
        </section>

        {/* Cache & Storage Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">💾</span>
            <div>
              <h3>Catalogue Cache & Data Architecture</h3>
              <p>Upstash Redis Edge caching (ADR-0015) with Supabase PostgREST fallback</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Active Data Source</strong>
                <span>
                  {source === 'redis'
                    ? '⚡ Upstash Redis Edge (Ultra-low latency snapshot)'
                    : source === 'cache'
                    ? '⚡ Instant Local Storage (Revalidating)'
                    : source === 'supabase'
                    ? 'Supabase PostgREST (Direct database query)'
                    : 'Connecting to catalogue…'}
                </span>
              </div>
              <span className={`badge ${source === 'redis' || source === 'cache' ? 'badge--success' : 'badge--info'}`}>
                {isUpstashConfigured ? 'Upstash Enabled' : 'Supabase Only'}
              </span>
            </div>

            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Cached Channels</strong>
                <span>{channels.length} channels loaded & indexed</span>
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
              <h3>Keyboard, Mouse & Remote Controls</h3>
              <p>Effortless navigation for desktop, trackpad, and TV remotes</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="shortcut-list">
              <div className="shortcut-item">
                <kbd>←</kbd> <kbd>→</kbd>
                <span>Navigate Channels in Row</span>
              </div>
              <div className="shortcut-item">
                <kbd>↑</kbd> <kbd>↓</kbd>
                <span>Switch Rows / Categories</span>
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
              <div className="shortcut-item">
                <kbd>Trackpad</kbd>
                <span>Smooth 2-Finger Horizontal Scroll</span>
              </div>
              <div className="shortcut-item">
                <kbd>Wheel</kbd>
                <span>Horizontal Category Scroll on Hover</span>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">ℹ️</span>
            <div>
              <h3>About StreamLoom Web</h3>
              <p>High performance IPTV & EPG streaming PWA</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="about-details">
              <p><strong>App:</strong> StreamLoom Web PWA</p>
              <p><strong>Stack:</strong> React 19 + Vite + TypeScript + HLS.js</p>
              <p><strong>Host:</strong> Cloudflare Pages Edge</p>
              <p><strong>Author:</strong> SoftArchium</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
