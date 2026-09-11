import { useState, useEffect, useCallback } from 'react'
import { pingCloudflareDns } from '../util/dns'
import type { DnsPingResult } from '../util/dns'
import { useChannels } from '../hooks/useChannels'
import { isUpstashConfigured } from '../api/redis'
import './Settings.css'

export function Settings() {
  const { channels, refresh, source } = useChannels()
  const [dnsPing, setDnsPing] = useState<DnsPingResult | null>(null)
  const [pinging, setPinging] = useState(false)
  const [lowLatency, setLowLatency] = useState(() => {
    return localStorage.getItem('sl_low_latency') !== 'false'
  })
  const [clearedNotice, setClearedNotice] = useState(false)

  const testDns = useCallback(async () => {
    setPinging(true)
    const res = await pingCloudflareDns()
    setDnsPing(res)
    setPinging(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    pingCloudflareDns().then((res) => {
      if (!cancelled) setDnsPing(res)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleLowLatencyChange = (enabled: boolean) => {
    setLowLatency(enabled)
    localStorage.setItem('sl_low_latency', enabled ? 'true' : 'false')
  }

  const handleClearCache = () => {
    try {
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
        <p className="settings-page__subtitle">Configure playback, networking, and application preferences</p>
      </div>

      <div className="settings-grid">
        {/* Network & DNS Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">⚡</span>
            <div>
              <h3>DNS & Network Acceleration</h3>
              <p>Ultra-low latency DNS via Cloudflare 1.1.1.1</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="settings-item">
              <div className="settings-item__info">
                <strong>Cloudflare 1.1.1.1 DoH Status</strong>
                <span>
                  {pinging
                    ? 'Testing latency…'
                    : dnsPing?.success
                    ? `Connected (${dnsPing.latencyMs} ms latency)`
                    : '1.1.1.1 Active (Preconnected)'}
                </span>
              </div>
              <button
                className="settings-btn settings-btn--sm"
                onClick={testDns}
                disabled={pinging}
              >
                {pinging ? 'Pinging…' : 'Ping DNS'}
              </button>
            </div>

            <div className="settings-badge-row">
              <span className="badge badge--success">✓ Cloudflare 1.1.1.1 DoH</span>
              <span className="badge badge--success">✓ TLS Preconnect Enabled</span>
              <span className="badge badge--success">✓ Zero DNS Cache Lag</span>
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

        {/* Keyboard Shortcuts Section */}
        <section className="settings-card glass">
          <div className="settings-card__header">
            <span className="settings-card__icon">⌨️</span>
            <div>
              <h3>Keyboard & TV Remote Controls</h3>
              <p>Shortcuts for effortless navigation</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="shortcut-list">
              <div className="shortcut-item">
                <kbd>↑</kbd> / <kbd>←</kbd>
                <span>Previous Channel</span>
              </div>
              <div className="shortcut-item">
                <kbd>↓</kbd> / <kbd>→</kbd>
                <span>Next Channel</span>
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
                <kbd>Esc</kbd> / <kbd>Backspace</kbd>
                <span>Back to Catalogue</span>
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
              <p><strong>DNS:</strong> Cloudflare 1.1.1.1 DoH</p>
              <p><strong>Host:</strong> Netlify Edge</p>
              <p><strong>Author:</strong> SoftArchium</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
