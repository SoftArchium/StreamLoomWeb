import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import { useEpg, useFavourites, useRecent } from '../hooks/useChannels'
import './VideoPlayer.css'

interface Props {
  channel: EnrichedChannel
  allChannels: EnrichedChannel[]
}

function getCurrentProgram(programs: EpgProgram[], nowMs: number): EpgProgram | undefined {
  return programs.find((p) => {
    const start = new Date(p.start_time).getTime()
    const end = new Date(p.end_time).getTime()
    return nowMs >= start && nowMs < end
  })
}

export function VideoPlayer({ channel, allChannels }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const navigate = useNavigate()
  const { programs } = useEpg(channel.id)
  const { isFavourite, toggle } = useFavourites()
  const { addRecent } = useRecent()

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isBuffering, setIsBuffering] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [showChannelList, setShowChannelList] = useState(false)

  const streamUrl = channel.stream?.url

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      setIsPlaying(true)
    } else {
      v.pause()
      setIsPlaying(false)
    }
  }, [])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setIsMuted(v.muted)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  const togglePiP = useCallback(async () => {
    const v = videoRef.current
    if (!v) return
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else if (document.pictureInPictureEnabled) {
        await v.requestPictureInPicture()
      }
    } catch {
      // ignore
    }
  }, [])

  const loadStream = useCallback((url: string) => {
    const video = videoRef.current
    if (!video) return

    setIsBuffering(true)
    setHasError(false)

    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (Hls.isSupported()) {
      const isLowLatency = localStorage.getItem('sl_low_latency') !== 'false'
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: isLowLatency,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        startFragPrefetch: true,
        // Fast start
        startLevel: -1,
        abrEwmaDefaultEstimate: 5_000_000,
        // Resilient loading
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 5,
        manifestLoadingRetryDelay: 500,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
      })

      hls.loadSource(url)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false)
        video.play().catch(() => {
          setIsPlaying(false)
        })
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setIsBuffering(false)
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              setHasError(true)
              setIsBuffering(false)
              hls.destroy()
              break
          }
        }
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url
      video.addEventListener('loadedmetadata', () => {
        setIsBuffering(false)
        video.play().catch(() => setIsPlaying(false))
      })
      video.addEventListener('error', () => {
        setHasError(true)
        setIsBuffering(false)
      })
    }
  }, [])

  useEffect(() => {
    if (streamUrl) {
      loadStream(streamUrl)
      addRecent(channel.id)
    }
    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [streamUrl, loadStream, addRecent, channel.id])

  // Keybindings
  useEffect(() => {
    const idx = allChannels.findIndex((c) => c.id === channel.id)

    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        const prev = [...allChannels].slice(0, idx).reverse().find((c) => c.stream)
        if (prev) navigate(`/watch/${encodeURIComponent(prev.id)}`, { replace: true })
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        const next = allChannels.slice(idx + 1).find((c) => c.stream)
        if (next) navigate(`/watch/${encodeURIComponent(next.id)}`, { replace: true })
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        if (showChannelList) {
          setShowChannelList(false)
        } else {
          navigate(-1)
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        togglePlayPause()
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen()
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [channel.id, allChannels, navigate, showChannelList, togglePlayPause, toggleFullscreen, toggleMute])

  const [currentTimestamp] = useState(() => Date.now())
  const nowPlaying = useMemo(() => getCurrentProgram(programs, currentTimestamp), [programs, currentTimestamp])
  const nextProgram = useMemo(
    () => programs.find((p) => new Date(p.start_time).getTime() > currentTimestamp),
    [programs, currentTimestamp]
  )
  const fav = isFavourite(channel.id)

  const channelIdx = allChannels.findIndex((c) => c.id === channel.id)
  const prevChannel = [...allChannels].slice(0, channelIdx).reverse().find((c) => c.stream)
  const nextChannel = allChannels.slice(channelIdx + 1).find((c) => c.stream)

  return (
    <div className="player" ref={containerRef}>
      <video
        ref={videoRef}
        className="player__video"
        autoPlay
        playsInline
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => {
          setIsBuffering(false)
          setIsPlaying(true)
        }}
        onClick={togglePlayPause}
      />

      {/* Buffering Indicator */}
      {isBuffering && !hasError && (
        <div className="player__state-overlay">
          <div className="guide-loader" />
          <span>Connecting stream…</span>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && (
        <div className="player__state-overlay player__state-overlay--error">
          <p>⚠️ Unable to play this stream</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {streamUrl && (
              <button
                className="player__overlay-btn"
                onClick={() => loadStream(streamUrl)}
              >
                Retry
              </button>
            )}
            {nextChannel && (
              <button
                className="player__overlay-btn"
                onClick={() => navigate(`/watch/${encodeURIComponent(nextChannel.id)}`, { replace: true })}
              >
                Next Channel →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="player__hud player__hud--top">
        <button className="player__back" onClick={() => navigate(-1)} aria-label="Go back">
          ← Back
        </button>

        <div className="player__info">
          {channel.logo && (
            <img src={channel.logo} alt={channel.name} className="player__logo" />
          )}
          <div>
            <p className="player__name">{channel.name}</p>
            {nowPlaying && (
              <p className="player__now">
                <span className="live-dot" style={{ marginRight: 6 }} />
                {nowPlaying.title}
              </p>
            )}
            {nextProgram && (
              <p className="player__next">Next: {nextProgram.title}</p>
            )}
          </div>
        </div>

        <div className="player__top-actions">
          <button
            className="player__action-btn"
            onClick={() => setShowChannelList((v) => !v)}
            title="Channels"
            aria-label="Toggle channel drawer"
          >
            ☰
          </button>
          <button
            className={`player__fav-btn ${fav ? 'player__fav-btn--active' : ''}`}
            onClick={() => toggle(channel.id)}
            aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
          >
            {fav ? '♥' : '♡'}
          </button>
        </div>
      </div>

      {/* Bottom HUD */}
      <div className="player__hud player__hud--bottom">
        <div className="player__bottom-left">
          <button
            className="player__action-btn"
            onClick={togglePlayPause}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="player__action-btn"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button
            className="player__ch-btn"
            onClick={() => prevChannel && navigate(`/watch/${encodeURIComponent(prevChannel.id)}`, { replace: true })}
            disabled={!prevChannel}
            aria-label="Previous channel"
          >
            ◀ {prevChannel?.name ?? '—'}
          </button>
        </div>

        <div className="player__ch-center">
          <span className="player__ch-number">CH {channelIdx + 1} of {allChannels.length}</span>
        </div>

        <div className="player__bottom-right">
          <button
            className="player__ch-btn"
            onClick={() => nextChannel && navigate(`/watch/${encodeURIComponent(nextChannel.id)}`, { replace: true })}
            disabled={!nextChannel}
            aria-label="Next channel"
          >
            {nextChannel?.name ?? '—'} ▶
          </button>
          <button
            className="player__action-btn"
            onClick={togglePiP}
            title="Picture-in-Picture"
            aria-label="Picture in Picture"
          >
            ⧉
          </button>
          <button
            className="player__action-btn"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            aria-label="Fullscreen"
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
        </div>
      </div>

      {/* Side Channel Switcher Drawer */}
      {showChannelList && (
        <div className="player__drawer glass">
          <div className="player__drawer-header">
            <h3>All Channels ({allChannels.length})</h3>
            <button onClick={() => setShowChannelList(false)} aria-label="Close drawer">✕</button>
          </div>
          <div className="player__drawer-list">
            {allChannels.map((c) => (
              <div
                key={c.id}
                className={`player__drawer-item ${c.id === channel.id ? 'player__drawer-item--active' : ''}`}
                onClick={() => {
                  setShowChannelList(false)
                  navigate(`/watch/${encodeURIComponent(c.id)}`, { replace: true })
                }}
              >
                {c.logo ? (
                  <img src={c.logo} alt={c.name} className="player__drawer-logo" loading="lazy" />
                ) : (
                  <div className="player__drawer-initials">{c.name.slice(0, 2).toUpperCase()}</div>
                )}
                <span className="player__drawer-name">{c.name}</span>
                {c.country && <span className="player__drawer-badge">{c.country}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls hint */}
      <p className="player__hint">
        ← / → switch channel · Space play/pause · M mute · F fullscreen · Esc return
      </p>
    </div>
  )
}
