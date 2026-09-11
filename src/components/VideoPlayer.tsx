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
  returnTo?: string
}

function getCurrentProgram(programs: EpgProgram[], nowMs: number): EpgProgram | undefined {
  return programs.find((p) => {
    const start = new Date(p.start_time).getTime()
    const end = new Date(p.end_time).getTime()
    return nowMs >= start && nowMs < end
  })
}

export function VideoPlayer({ channel, allChannels, returnTo = '/' }: Props) {
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
  const [showHud, setShowHud] = useState(true)
  const hideHudTimer = useRef<number | null>(null)

  const resetHudTimer = useCallback(() => {
    setShowHud(true)
    if (hideHudTimer.current) window.clearTimeout(hideHudTimer.current)
    hideHudTimer.current = window.setTimeout(() => {
      setShowHud(false)
    }, 4000)
  }, [])

  useEffect(() => {
    if (hideHudTimer.current) window.clearTimeout(hideHudTimer.current)
    hideHudTimer.current = window.setTimeout(() => {
      setShowHud(false)
    }, 4000)
    return () => {
      if (hideHudTimer.current) window.clearTimeout(hideHudTimer.current)
    }
  }, [channel.id])

  const streamUrl = channel.stream?.url

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      setIsPlaying(true)
    } else {
      v.pause()
    }
    resetHudTimer()
  }, [resetHudTimer])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setIsMuted(v.muted)
    resetHudTimer()
  }, [resetHudTimer])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => {
        setIsFullscreen(true)
        if (hideHudTimer.current) window.clearTimeout(hideHudTimer.current)
        hideHudTimer.current = window.setTimeout(() => {
          setShowHud(false)
        }, 1200)
      }).catch(() => {})
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
        setShowHud(true)
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    function onFullscreenChange() {
      const isFs = Boolean(document.fullscreenElement)
      setIsFullscreen(isFs)
      if (isFs) {
        if (hideHudTimer.current) window.clearTimeout(hideHudTimer.current)
        hideHudTimer.current = window.setTimeout(() => {
          setShowHud(false)
        }, 1200)
      } else {
        setShowHud(true)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const handleMouseMove = useCallback(() => {
    setShowHud(true)
    if (hideHudTimer.current) window.clearTimeout(hideHudTimer.current)
    hideHudTimer.current = window.setTimeout(() => {
      setShowHud(false)
    }, isFullscreen ? 1800 : 3500)
  }, [isFullscreen])

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
    resetHudTimer()
  }, [resetHudTimer])

  // Switch channel preserving the active playlist and return path
  const switchChannel = useCallback((target: EnrichedChannel) => {
    sessionStorage.setItem('sl_last_viewed', target.id)
    const playlistIds = allChannels.map((c) => c.id)
    try {
      sessionStorage.setItem('sl_active_playlist', JSON.stringify(playlistIds))
    } catch {}
    navigate(`/watch/${encodeURIComponent(target.id)}`, {
      replace: true,
      state: {
        playlist: playlistIds,
        returnTo,
      },
    })
  }, [allChannels, returnTo, navigate])

  // Return to the exact screen entered from and target the last watched channel
  const handleBack = useCallback(() => {
    sessionStorage.setItem('sl_last_viewed', channel.id)
    navigate(returnTo, { state: { targetChannelId: channel.id } })
  }, [channel.id, returnTo, navigate])

  const channelIdx = allChannels.findIndex((c) => c.id === channel.id)

  // Cycle within filtered list in the same order shown, with wraparound
  const prevChannel = useMemo(() => {
    if (allChannels.length <= 1) return null
    if (channelIdx > 0) return allChannels[channelIdx - 1]
    return allChannels[allChannels.length - 1]
  }, [allChannels, channelIdx])

  const nextChannel = useMemo(() => {
    if (allChannels.length <= 1) return null
    if (channelIdx >= 0 && channelIdx < allChannels.length - 1) return allChannels[channelIdx + 1]
    return allChannels[0]
  }, [allChannels, channelIdx])

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
        startLevel: -1,
        abrEwmaDefaultEstimate: 5_000_000,
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
      sessionStorage.setItem('sl_last_viewed', channel.id)
    }
    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [streamUrl, loadStream, addRecent, channel.id])

  // Keybindings
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      handleMouseMove()

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === '[' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        if (prevChannel) switchChannel(prevChannel)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ']' || e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        if (nextChannel) switchChannel(nextChannel)
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        if (showChannelList) {
          setShowChannelList(false)
        } else {
          handleBack()
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
  }, [prevChannel, nextChannel, switchChannel, handleBack, showChannelList, togglePlayPause, toggleFullscreen, toggleMute, handleMouseMove])

  const [currentTimestamp] = useState(() => Date.now())
  const nowPlaying = useMemo(() => getCurrentProgram(programs, currentTimestamp), [programs, currentTimestamp])
  const nextProgram = useMemo(
    () => programs.find((p) => new Date(p.start_time).getTime() > currentTimestamp),
    [programs, currentTimestamp]
  )
  const fav = isFavourite(channel.id)

  return (
    <div
      className={`player ${showHud ? 'player--hud-visible' : ''} ${isFullscreen ? 'player--fullscreen' : ''}`}
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchStart={handleMouseMove}
    >
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
        onClick={() => setShowHud((v) => !v)}
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
                onClick={() => switchChannel(nextChannel)}
              >
                Next Channel →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="player__hud player__hud--top">
        <button className="player__back" onClick={handleBack} aria-label="Go back">
          ← Back
        </button>

        <div className="player__info">
          {channel.logo && (
            <img src={channel.logo} alt={channel.name} className="player__logo" />
          )}
          <div className="player__info-text">
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
        <div className="player__bottom-layout">
          {/* Channel cycling controls */}
          <div className="player__ch-nav">
            <button
              className="player__ch-btn"
              onClick={() => prevChannel && switchChannel(prevChannel)}
              disabled={!prevChannel}
              aria-label="Previous channel"
            >
              ◀ <span className="player__ch-label">{prevChannel?.name ?? '—'}</span>
            </button>

            <div className="player__ch-center">
              <span className="player__ch-number">CH {channelIdx + 1} of {allChannels.length}</span>
            </div>

            <button
              className="player__ch-btn"
              onClick={() => nextChannel && switchChannel(nextChannel)}
              disabled={!nextChannel}
              aria-label="Next channel"
            >
              <span className="player__ch-label">{nextChannel?.name ?? '—'}</span> ▶
            </button>
          </div>

          {/* Media actions */}
          <div className="player__playback-nav">
            <div className="player__playback-left">
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
            </div>

            <div className="player__playback-right">
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
        </div>
      </div>

      {/* Side Channel Switcher Drawer */}
      {showChannelList && (
        <div className="player__drawer glass">
          <div className="player__drawer-header">
            <h3>Playlist Channels ({allChannels.length})</h3>
            <button onClick={() => setShowChannelList(false)} aria-label="Close drawer">✕</button>
          </div>
          <div className="player__drawer-list">
            {allChannels.map((c) => (
              <div
                key={c.id}
                className={`player__drawer-item ${c.id === channel.id ? 'player__drawer-item--active' : ''}`}
                onClick={() => {
                  setShowChannelList(false)
                  switchChannel(c)
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
