import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import { useEpg, useFavourites, useRecent } from '../hooks/useChannels'
import { formatCountryDisplay } from '../util/country'
import { getProxyStreamUrl, isMixedContent, markStreamBroken, unmarkStreamBroken, tryUpgradeToHttps } from '../util/stream'
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
  const connectionTimeoutTimer = useRef<number | null>(null)

  const isHudVisible = showHud || isBuffering

  const resetHudTimer = useCallback(() => {
    setShowHud(true)
    if (hideHudTimer.current) window.clearTimeout(hideHudTimer.current)
    if (!isBuffering) {
      hideHudTimer.current = window.setTimeout(() => {
        setShowHud(false)
      }, isFullscreen ? 1800 : 3500)
    }
  }, [isBuffering, isFullscreen])

  const channelStreams = useMemo(() => {
    if (channel.streams && channel.streams.length > 0) {
      return channel.streams
    }
    return channel.stream ? [channel.stream] : []
  }, [channel])

  const [prevChannelId, setPrevChannelId] = useState(channel.id)
  const [activeStreamIdx, setActiveStreamIdx] = useState(0)

  if (channel.id !== prevChannelId) {
    setPrevChannelId(channel.id)
    setActiveStreamIdx(0)
  }

  const currentStream = channelStreams[activeStreamIdx] || channel.stream
  const streamUrl = currentStream?.url

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
    // Immediately stop current HLS loader and media buffer to prevent lockup
    if (hlsRef.current) {
      hlsRef.current.stopLoad()
      hlsRef.current.detachMedia()
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }

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
    if (hlsRef.current) {
      hlsRef.current.stopLoad()
      hlsRef.current.detachMedia()
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
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

  const [isSlowConnecting, setIsSlowConnecting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const isProxiedRef = useRef(false)
  const [isProxied, setIsProxied] = useState(false)
  const [autoSkipCountdown, setAutoSkipCountdown] = useState<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)

  const showToast = useCallback((msg: string, duration = 2500) => {
    setToastMessage(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => {
      setToastMessage(null)
    }, duration)
  }, [])

  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setAutoSkipCountdown(null)
  }, [])

  const switchChannelCleanly = useCallback((target: EnrichedChannel) => {
    cancelCountdown()
    switchChannel(target)
  }, [cancelCountdown, switchChannel])

  const triggerAutoSkipCountdown = useCallback(() => {
    const autoSkip = localStorage.getItem('sl_auto_skip') === 'true'
    if (!autoSkip || !nextChannel || nextChannel.id === channel.id) return

    let remaining = 5
    setAutoSkipCountdown(remaining)
    if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current)

    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        if (countdownTimerRef.current) window.clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
        setAutoSkipCountdown(null)
        markStreamBroken(channel.id)
        switchChannel(nextChannel)
      } else {
        setAutoSkipCountdown(remaining)
      }
    }, 1000)
  }, [channel.id, nextChannel, switchChannel])

  const loadStreamRef = useRef<((url: string, useProxy?: boolean) => void) | null>(null)

  const handleNextStreamCandidate = useCallback(() => {
    if (channelStreams.length <= 1) return
    const nextIdx = (activeStreamIdx + 1) % channelStreams.length
    setActiveStreamIdx(nextIdx)
    showToast(`Switching to stream candidate ${nextIdx + 1} of ${channelStreams.length}…`)
    loadStreamRef.current?.(channelStreams[nextIdx].url, false)
  }, [channelStreams, activeStreamIdx, showToast])

  const loadStream = useCallback((url: string, useProxy = false) => {
    const video = videoRef.current
    if (!video) return

    setIsBuffering(true)
    setIsSlowConnecting(false)
    setHasError(false)
    cancelCountdown()
    isProxiedRef.current = useProxy
    setIsProxied(useProxy)

    if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)

    // Slow connection indicator after 5s without interrupting buffering
    connectionTimeoutTimer.current = window.setTimeout(() => {
      setIsSlowConnecting(true)
    }, 5000)

    if (hlsRef.current) {
      hlsRef.current.stopLoad()
      hlsRef.current.detachMedia()
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // Determine target playback URL:
    // If proxy requested: route via /api/proxy
    // If mixed content (http on https): try HTTPS upgrade first before falling back to proxy
    let targetUrl = url
    if (useProxy) {
      targetUrl = getProxyStreamUrl(url)
    } else if (isMixedContent(url)) {
      targetUrl = tryUpgradeToHttps(url)
    }

    if (Hls.isSupported()) {
      const isLowLatency = localStorage.getItem('sl_low_latency') !== 'false'
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: isLowLatency,
        backBufferLength: 15,
        maxBufferLength: 20,
        maxMaxBufferLength: 30,
        maxBufferSize: 20 * 1024 * 1024,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 3,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        startFragPrefetch: true,
        startLevel: -1,
        abrEwmaDefaultEstimate: 5_000_000,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 500,
        levelLoadingTimeOut: 12000,
        fragLoadingTimeOut: 15000,
        fragLoadingMaxRetry: 3,
        fragLoadingRetryDelay: 500,
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.addEventListener('readystatechange', () => {
            // Guard against HTML payloads (e.g. SPA index.html returned by unconfigured proxy)
            if (xhr.readyState === 4 && xhr.status === 200) {
              const ct = (xhr.getResponseHeader('Content-Type') || '').toLowerCase()
              if (ct.includes('text/html')) {
                xhr.abort()
              }
            }
          })
        },
      })

      hls.loadSource(targetUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false)
        setIsSlowConnecting(false)
        unmarkStreamBroken(channel.id)
        if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
        video.play().catch(() => {
          setIsPlaying(false)
        })
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setIsBuffering(false)
        setIsSlowConnecting(false)
        unmarkStreamBroken(channel.id)
        if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // If direct/upgraded failed and proxy not tried yet, failover to edge proxy
              if (!isProxiedRef.current && !url.startsWith('/api/proxy')) {
                showToast('Direct stream blocked, retrying via edge proxy…')
                loadStreamRef.current?.(url, true)
              } else if (channelStreams.length > 1 && activeStreamIdx < channelStreams.length - 1) {
                const nextIdx = activeStreamIdx + 1
                setActiveStreamIdx(nextIdx)
                showToast(`Trying alternate stream candidate (${nextIdx + 1}/${channelStreams.length})…`)
                loadStreamRef.current?.(channelStreams[nextIdx].url, false)
              } else {
                setHasError(true)
                setIsBuffering(false)
                setIsSlowConnecting(false)
                if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
                hls.destroy()
                triggerAutoSkipCountdown()
              }
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              if (channelStreams.length > 1 && activeStreamIdx < channelStreams.length - 1) {
                const nextIdx = activeStreamIdx + 1
                setActiveStreamIdx(nextIdx)
                showToast(`Playback error, trying alternate stream (${nextIdx + 1}/${channelStreams.length})…`)
                loadStreamRef.current?.(channelStreams[nextIdx].url, false)
              } else {
                setHasError(true)
                setIsBuffering(false)
                setIsSlowConnecting(false)
                if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
                hls.destroy()
                triggerAutoSkipCountdown()
              }
              break
          }
        }
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl
      video.addEventListener('loadedmetadata', () => {
        setIsBuffering(false)
        setIsSlowConnecting(false)
        unmarkStreamBroken(channel.id)
        if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
        video.play().catch(() => setIsPlaying(false))
      })
      video.addEventListener('error', () => {
        if (!isProxiedRef.current && !url.startsWith('/api/proxy')) {
          loadStreamRef.current?.(url, true)
        } else if (channelStreams.length > 1 && activeStreamIdx < channelStreams.length - 1) {
          const nextIdx = activeStreamIdx + 1
          setActiveStreamIdx(nextIdx)
          loadStreamRef.current?.(channelStreams[nextIdx].url, false)
        } else {
          setHasError(true)
          setIsBuffering(false)
          setIsSlowConnecting(false)
          if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
          triggerAutoSkipCountdown()
        }
      })
    }
  }, [channel.id, channelStreams, activeStreamIdx, showToast, cancelCountdown, triggerAutoSkipCountdown])

  useEffect(() => {
    loadStreamRef.current = loadStream
  }, [loadStream])

  useEffect(() => {
    const video = videoRef.current
    if (streamUrl) {
      loadStream(streamUrl)
      addRecent(channel.id)
      sessionStorage.setItem('sl_last_viewed', channel.id)
    }
    return () => {
      cancelCountdown()
      if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
      if (hlsRef.current) {
        hlsRef.current.stopLoad()
        hlsRef.current.detachMedia()
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      if (video) {
        video.pause()
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [streamUrl, loadStream, addRecent, channel.id, cancelCountdown])

  // Keybindings
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      handleMouseMove()

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === '[' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        if (prevChannel) switchChannelCleanly(prevChannel)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ']' || e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        if (nextChannel) switchChannelCleanly(nextChannel)
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
  }, [prevChannel, nextChannel, switchChannelCleanly, handleBack, showChannelList, togglePlayPause, toggleFullscreen, toggleMute, handleMouseMove])

  const [currentTimestamp] = useState(() => Date.now())
  const nowPlaying = useMemo(() => getCurrentProgram(programs, currentTimestamp), [programs, currentTimestamp])
  const nextProgram = useMemo(
    () => programs.find((p) => new Date(p.start_time).getTime() > currentTimestamp),
    [programs, currentTimestamp]
  )
  const fav = isFavourite(channel.id)

  return (
    <div
      className={`player ${isHudVisible ? 'player--hud-visible' : ''} ${isFullscreen ? 'player--fullscreen' : ''}`}
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
        <div className="player__state-overlay player__state-overlay--connecting">
          <div className="guide-loader" />
          <div className="player__connecting-content">
            <p className="player__connecting-title">
              {isSlowConnecting ? 'Stream is slow to respond' : `Connecting to ${channel.name}…`}
            </p>
            {isSlowConnecting && (
              <p className="player__connecting-sub">This stream might be experiencing high latency.</p>
            )}
          </div>
          <div className="player__connecting-actions">
            {nextChannel && (
              <button
                className="player__overlay-btn player__overlay-btn--skip"
                onClick={() => switchChannelCleanly(nextChannel)}
                aria-label="Skip to next channel"
              >
                Skip Channel ⏭
              </button>
            )}
            {streamUrl && isSlowConnecting && (
              <button
                className="player__overlay-btn player__overlay-btn--retry"
                onClick={() => loadStream(streamUrl)}
                aria-label="Retry connection"
              >
                Retry ↺
              </button>
            )}
            <button
              className="player__overlay-btn player__overlay-btn--back"
              onClick={handleBack}
              aria-label="Back to channels"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Toast message */}
      {toastMessage && (
        <div className="player__toast">
          <span>⚡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Overlay */}
      {hasError && (
        <div className="player__state-overlay player__state-overlay--error">
          <div className="player__connecting-content">
            <p className="player__connecting-title">⚠️ Stream Unavailable</p>
            <p className="player__connecting-sub">
              {isProxied
                ? 'Unable to connect directly or via edge proxy.'
                : 'Direct stream connection could not be established.'}
            </p>
            {autoSkipCountdown !== null && (
              <p className="player__error-countdown">
                Auto-advancing in {autoSkipCountdown}s…{' '}
                <button
                  className="player__countdown-cancel"
                  onClick={cancelCountdown}
                  type="button"
                >
                  Cancel
                </button>
              </p>
            )}
          </div>
          <div className="player__connecting-actions">
            {streamUrl && (
              <button
                className="player__overlay-btn player__overlay-btn--retry"
                onClick={() => loadStream(streamUrl, !isProxied)}
              >
                {isProxied ? 'Retry Direct ↺' : 'Try Relay Proxy ⚡'}
              </button>
            )}
            {channelStreams.length > 1 && (
              <button
                className="player__overlay-btn"
                onClick={handleNextStreamCandidate}
              >
                Alternate Stream ({activeStreamIdx + 1}/{channelStreams.length})
              </button>
            )}
            {nextChannel && (
              <button
                className="player__overlay-btn player__overlay-btn--skip"
                onClick={() => switchChannelCleanly(nextChannel)}
              >
                Next Channel ⏭
              </button>
            )}
            <button
              className="player__overlay-btn player__overlay-btn--back"
              onClick={() => {
                cancelCountdown()
                handleBack()
              }}
            >
              ← Back
            </button>
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
              onClick={() => prevChannel && switchChannelCleanly(prevChannel)}
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
              onClick={() => nextChannel && switchChannelCleanly(nextChannel)}
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
                {c.country && <span className="player__drawer-badge">{formatCountryDisplay(c.country)}</span>}
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
