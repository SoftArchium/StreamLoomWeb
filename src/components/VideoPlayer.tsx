import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import { useEpg, useFavourites, useRecent } from '../hooks/useChannels'
import { formatCountryDisplay } from '../util/country'
import {
  getProxyStreamUrl,
  isMixedContent,
  markStreamBroken,
  unmarkStreamBroken,
  tryUpgradeToHttps,
  getCachedWorkingStream,
  cacheWorkingStream,
  fetchEdgeVerifiedStreams,
} from '../util/stream'
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
  const [isSlowConnecting, setIsSlowConnecting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)
  const [autoSkipCountdown, setAutoSkipCountdown] = useState<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const [showChannelList, setShowChannelList] = useState(false)
  const [showHud, setShowHud] = useState(true)
  const hideHudTimer = useRef<number | null>(null)
  const connectionTimeoutTimer = useRef<number | null>(null)
  const failoverTimer = useRef<number | null>(null)

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
    const rawStreams = channel.streams && channel.streams.length > 0
      ? channel.streams
      : (channel.stream ? [channel.stream] : [])

    const cached = getCachedWorkingStream(channel.id)
    if (cached && rawStreams.length > 1) {
      const match = rawStreams.find((s) => s.url === cached.url)
      if (match) {
        return [match, ...rawStreams.filter((s) => s.url !== cached.url)]
      }
    }
    return rawStreams
  }, [channel])

  const [prevChannelId, setPrevChannelId] = useState(channel.id)
  const [activeStreamIdx, setActiveStreamIdx] = useState(0)
  const [isProxied, setIsProxied] = useState(() => {
    const cached = getCachedWorkingStream(channel.id)
    const rawStreams = channel.streams && channel.streams.length > 0
      ? channel.streams
      : (channel.stream ? [channel.stream] : [])
    const firstUrl = (cached && rawStreams.find((s) => s.url === cached.url)?.url) || rawStreams[0]?.url
    if (firstUrl && cached && cached.url === firstUrl) {
      return cached.useProxy || isMixedContent(firstUrl)
    }
    return firstUrl ? isMixedContent(firstUrl) : false
  })
  const [retryNonce, setRetryNonce] = useState(0)

  if (channel.id !== prevChannelId) {
    setPrevChannelId(channel.id)
    setActiveStreamIdx(0)
    const cached = getCachedWorkingStream(channel.id)
    const rawStreams = channel.streams && channel.streams.length > 0
      ? channel.streams
      : (channel.stream ? [channel.stream] : [])
    const firstCandidate = (cached && rawStreams.find((s) => s.url === cached.url)) || rawStreams[0]
    const initProxy = firstCandidate
      ? ((cached && cached.url === firstCandidate.url ? cached.useProxy : false) || isMixedContent(firstCandidate.url))
      : false
    setIsProxied(initProxy)
    setHasError(false)
    setIsBuffering(true)
    setIsSlowConnecting(false)
    setShowHud(true)
  }

  const activeStreamIdxRef = useRef(activeStreamIdx)
  const isProxiedRef = useRef(isProxied)
  const channelStreamsRef = useRef(channelStreams)

  useEffect(() => {
    activeStreamIdxRef.current = activeStreamIdx
    isProxiedRef.current = isProxied
    channelStreamsRef.current = channelStreams
  }, [activeStreamIdx, isProxied, channelStreams])

  // Proactively check edge-verified working stream for this POP if channel has multiple candidates
  useEffect(() => {
    if (!channelStreams || channelStreams.length <= 1) return
    const cached = getCachedWorkingStream(channel.id)
    if (cached) return

    let cancelled = false
    const urls = channelStreams.map((s) => s.url)
    fetchEdgeVerifiedStreams(channel.id, urls).then((result) => {
      if (cancelled || !result || !result.workingStream) return
      cacheWorkingStream(channel.id, result.workingStream, isProxiedRef.current)
      const matchIdx = channelStreamsRef.current.findIndex((s) => s.url === result.workingStream)
      if (matchIdx > 0 && activeStreamIdxRef.current === 0) {
        setActiveStreamIdx(matchIdx)
      }
    })

    return () => {
      cancelled = true
    }
  }, [channel.id, channelStreams])

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
      setAutoSkipCountdown(null)
    }
  }, [])

  // Switch channel preserving the active playlist and return path
  const switchChannel = useCallback((target: EnrichedChannel) => {
    if (failoverTimer.current) {
      window.clearTimeout(failoverTimer.current)
      failoverTimer.current = null
    }
    if (connectionTimeoutTimer.current) {
      window.clearTimeout(connectionTimeoutTimer.current)
      connectionTimeoutTimer.current = null
    }
    // Immediately stop current HLS loader and media buffer to prevent lockup
    if (hlsRef.current) {
      hlsRef.current.stopLoad()
      hlsRef.current.detachMedia()
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.onloadedmetadata = null
      video.onerror = null
      video.pause()
    }

    sessionStorage.setItem('sl_last_viewed', target.id)
    ;(document.activeElement as HTMLElement)?.blur?.()

    // Only persist custom playlist if it's a filtered subset (< 500 channels)
    // Avoid serializing 11,000 IDs to history state / sessionStorage on every channel change!
    const isCustomPlaylist = allChannels.length > 1 && allChannels.length < 500
    const playlistIds = isCustomPlaylist ? allChannels.map((c) => c.id) : undefined
    if (isCustomPlaylist) {
      try {
        sessionStorage.setItem('sl_active_playlist', JSON.stringify(playlistIds))
      } catch {}
    }

    navigate(`/watch/${encodeURIComponent(target.id)}`, {
      replace: true,
      state: {
        playlist: playlistIds,
        returnTo,
      },
    })
  }, [allChannels, returnTo, navigate])

  const switchChannelCleanly = useCallback((target: EnrichedChannel) => {
    cancelCountdown()
    switchChannel(target)
  }, [cancelCountdown, switchChannel])

  // Return to the exact screen entered from and target the last watched channel
  const handleBack = useCallback(() => {
    cancelCountdown()
    if (failoverTimer.current) {
      window.clearTimeout(failoverTimer.current)
      failoverTimer.current = null
    }
    if (connectionTimeoutTimer.current) {
      window.clearTimeout(connectionTimeoutTimer.current)
      connectionTimeoutTimer.current = null
    }
    if (hlsRef.current) {
      hlsRef.current.stopLoad()
      hlsRef.current.detachMedia()
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.onloadedmetadata = null
      video.onerror = null
      video.pause()
    }
    sessionStorage.setItem('sl_last_viewed', channel.id)
    ;(document.activeElement as HTMLElement)?.blur?.()
    navigate(returnTo, { state: { targetChannelId: channel.id } })
  }, [cancelCountdown, channel.id, returnTo, navigate])

  const targetChannelIdRef = useRef(channel.id)

  useEffect(() => {
    targetChannelIdRef.current = channel.id
  }, [channel.id])

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

  const goToNextChannel = useCallback(() => {
    if (allChannels.length <= 1) return
    const currentId = targetChannelIdRef.current
    const curIdx = allChannels.findIndex((c) => c.id === currentId)
    const nextIdx = curIdx >= 0 && curIdx < allChannels.length - 1 ? curIdx + 1 : 0
    const target = allChannels[nextIdx]
    if (target) {
      targetChannelIdRef.current = target.id
      switchChannelCleanly(target)
    }
  }, [allChannels, switchChannelCleanly])

  const goToPrevChannel = useCallback(() => {
    if (allChannels.length <= 1) return
    const currentId = targetChannelIdRef.current
    const curIdx = allChannels.findIndex((c) => c.id === currentId)
    const prevIdx = curIdx > 0 ? curIdx - 1 : allChannels.length - 1
    const target = allChannels[prevIdx]
    if (target) {
      targetChannelIdRef.current = target.id
      switchChannelCleanly(target)
    }
  }, [allChannels, switchChannelCleanly])

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
        switchChannelCleanly(nextChannel)
      } else {
        setAutoSkipCountdown(remaining)
      }
    }, 1000)
  }, [channel.id, nextChannel, switchChannelCleanly])

  const failoverToNextAttempt = useCallback(() => {
    if (failoverTimer.current) {
      window.clearTimeout(failoverTimer.current)
      failoverTimer.current = null
    }

    const curIdx = activeStreamIdxRef.current
    const streams = channelStreamsRef.current
    const curStream = streams[curIdx]
    const curUrl = curStream?.url
    const currentIsProxied = isProxiedRef.current

    // 1. If currently direct, retry via edge proxy
    if (!currentIsProxied && curUrl && !curUrl.startsWith('/api/proxy')) {
      showToast('Direct stream blocked, retrying via edge proxy…')
      isProxiedRef.current = true
      setIsProxied(true)
      setIsBuffering(true)
      setIsSlowConnecting(false)
      return
    }

    // 2. If proxy also failed (or mixed content proxy failed), try next candidate
    if (streams.length > 1 && curIdx < streams.length - 1) {
      const nextIdx = curIdx + 1
      const nextStream = streams[nextIdx]
      const nextUseProxy = isMixedContent(nextStream.url)
      showToast(`Stream unresponsive, trying candidate ${nextIdx + 1} of ${streams.length}…`)
      activeStreamIdxRef.current = nextIdx
      setActiveStreamIdx(nextIdx)
      isProxiedRef.current = nextUseProxy
      setIsProxied(nextUseProxy)
      setIsBuffering(true)
      setIsSlowConnecting(false)
      return
    }

    // 3. All stream candidates and proxy attempts exhausted
    setHasError(true)
    setIsBuffering(false)
    setIsSlowConnecting(false)
    markStreamBroken(channel.id)
    triggerAutoSkipCountdown()
  }, [channel.id, showToast, triggerAutoSkipCountdown])

  const handleNextStreamCandidate = useCallback(() => {
    cancelCountdown()
    if (channelStreams.length <= 1) return
    const curIdx = activeStreamIdxRef.current
    const nextIdx = (curIdx + 1) % channelStreams.length
    const nextStream = channelStreams[nextIdx]
    const nextUseProxy = isMixedContent(nextStream.url)
    activeStreamIdxRef.current = nextIdx
    setActiveStreamIdx(nextIdx)
    isProxiedRef.current = nextUseProxy
    setIsProxied(nextUseProxy)
    setHasError(false)
    setIsBuffering(true)
    setIsSlowConnecting(false)
    showToast(`Switching to stream candidate ${nextIdx + 1} of ${channelStreams.length}…`)
  }, [channelStreams, showToast, cancelCountdown])

  const handleRetry = useCallback(() => {
    cancelCountdown()
    setHasError(false)
    setIsBuffering(true)
    setIsSlowConnecting(false)
    setActiveStreamIdx(0)
    activeStreamIdxRef.current = 0
    const rawStreams = channelStreamsRef.current
    const firstUrl = rawStreams[0]?.url
    const initProxy = firstUrl ? isMixedContent(firstUrl) : false
    isProxiedRef.current = initProxy
    setIsProxied(initProxy)
    setRetryNonce((n) => n + 1)
  }, [cancelCountdown])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const stream = channelStreams[activeStreamIdx] || channel.stream
    const rawUrl = stream?.url
    if (!rawUrl) {
      window.queueMicrotask(() => {
        setHasError(true)
        setIsBuffering(false)
      })
      return
    }

    cancelCountdown()

    let isDisposed = false

    if (connectionTimeoutTimer.current) window.clearTimeout(connectionTimeoutTimer.current)
    if (failoverTimer.current) window.clearTimeout(failoverTimer.current)

    // Slow connection indicator after 4.5s
    connectionTimeoutTimer.current = window.setTimeout(() => {
      if (!isDisposed) setIsSlowConnecting(true)
    }, 4500)

    // Failover watchdog timer: if stream not parsed / buffered in 6.5s, trigger failover
    failoverTimer.current = window.setTimeout(() => {
      if (!isDisposed) {
        failoverToNextAttempt()
      }
    }, 6500)

    const onPlaybackSuccess = () => {
      if (isDisposed) return
      if (failoverTimer.current) {
        window.clearTimeout(failoverTimer.current)
        failoverTimer.current = null
      }
      if (connectionTimeoutTimer.current) {
        window.clearTimeout(connectionTimeoutTimer.current)
        connectionTimeoutTimer.current = null
      }
      setIsBuffering(false)
      setIsSlowConnecting(false)
      setHasError(false)
      unmarkStreamBroken(channel.id)
      cacheWorkingStream(channel.id, rawUrl, isProxied)
    }

    // Determine target playback URL
    let targetUrl = rawUrl
    if (isProxied) {
      const fallbackUrls = channelStreams
        .filter((_, idx) => idx !== activeStreamIdx)
        .map((s) => s.url)
      targetUrl = getProxyStreamUrl(
        rawUrl,
        null,
        null,
        fallbackUrls,
        channel.id
      )
    } else if (isMixedContent(rawUrl)) {
      targetUrl = tryUpgradeToHttps(rawUrl)
    }

    // Stop and cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.stopLoad()
      hlsRef.current.detachMedia()
      hlsRef.current.destroy()
      hlsRef.current = null
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
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 2,
        manifestLoadingRetryDelay: 500,
        levelLoadingTimeOut: 10000,
        fragLoadingTimeOut: 12000,
        fragLoadingMaxRetry: 2,
        fragLoadingRetryDelay: 500,
        xhrSetup: (xhr: XMLHttpRequest) => {
          xhr.addEventListener('readystatechange', () => {
            // Guard against HTML payloads (e.g. SPA index.html returned by unconfigured proxy)
            if (xhr.readyState === 4 && xhr.status === 200) {
              const ct = (xhr.getResponseHeader('Content-Type') || '').toLowerCase()
              if (ct.includes('text/html')) {
                xhr.abort()
              }
              const resolvedStream = xhr.getResponseHeader('X-Stream-Resolved')
              if (resolvedStream && resolvedStream !== rawUrl) {
                cacheWorkingStream(channel.id, resolvedStream, true)
                const matchIdx = channelStreamsRef.current.findIndex((s) => s.url === resolvedStream)
                if (matchIdx >= 0) {
                  activeStreamIdxRef.current = matchIdx
                }
              }
            }
          })
        },
      })

      hls.loadSource(targetUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onPlaybackSuccess()
        video.play().catch(() => {
          setIsPlaying(false)
        })
      })

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        onPlaybackSuccess()
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (isDisposed) return
        if (data.fatal) {
          if (failoverTimer.current) {
            window.clearTimeout(failoverTimer.current)
            failoverTimer.current = null
          }
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            case Hls.ErrorTypes.NETWORK_ERROR:
            default:
              failoverToNextAttempt()
              break
          }
        }
      })

      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = targetUrl
      video.onloadedmetadata = () => {
        onPlaybackSuccess()
        video.play().catch(() => setIsPlaying(false))
      }
      video.onerror = () => {
        if (!isDisposed) {
          if (failoverTimer.current) {
            window.clearTimeout(failoverTimer.current)
            failoverTimer.current = null
          }
          failoverToNextAttempt()
        }
      }
    }

    addRecent(channel.id)
    sessionStorage.setItem('sl_last_viewed', channel.id)

    return () => {
      isDisposed = true
      if (failoverTimer.current) {
        window.clearTimeout(failoverTimer.current)
        failoverTimer.current = null
      }
      if (connectionTimeoutTimer.current) {
        window.clearTimeout(connectionTimeoutTimer.current)
        connectionTimeoutTimer.current = null
      }
      if (hlsRef.current) {
        hlsRef.current.stopLoad()
        hlsRef.current.detachMedia()
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      video.onloadedmetadata = null
      video.onerror = null
    }
  }, [channel.id, activeStreamIdx, isProxied, retryNonce, channelStreams, channel.stream, addRecent, failoverToNextAttempt, cancelCountdown])

  // Keybindings: attached once with stable ref to guarantee zero dropped key events
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {})

  const onKey = useCallback((e: KeyboardEvent) => {
    const targetTag = (e.target as HTMLElement)?.tagName
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return

    handleMouseMove()

    if (showChannelList) {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        setShowChannelList(false)
        return
      }
      // Don't hijack vertical arrows when browsing the channel list drawer
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        return
      }
    }

    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowUp' ||
      e.key === '[' ||
      e.key === 'p' ||
      e.key === 'P' ||
      e.key === 'ChannelDown' ||
      e.key === 'PageUp' ||
      e.key === 'MediaTrackPrevious'
    ) {
      e.preventDefault()
      goToPrevChannel()
    } else if (
      e.key === 'ArrowRight' ||
      e.key === 'ArrowDown' ||
      e.key === ']' ||
      e.key === 'n' ||
      e.key === 'N' ||
      e.key === 'ChannelUp' ||
      e.key === 'PageDown' ||
      e.key === 'MediaTrackNext'
    ) {
      e.preventDefault()
      goToNextChannel()
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault()
      handleBack()
    } else if (e.key === ' ') {
      e.preventDefault()
      togglePlayPause()
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      toggleFullscreen()
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault()
      toggleMute()
    }
  }, [showChannelList, handleMouseMove, goToPrevChannel, goToNextChannel, handleBack, togglePlayPause, toggleFullscreen, toggleMute])

  useEffect(() => {
    onKeyRef.current = onKey
  }, [onKey])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      onKeyRef.current(e)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
                onClick={goToNextChannel}
                aria-label="Skip to next channel"
              >
                Skip Channel ⏭
              </button>
            )}
            {channelStreams.length > 1 && (
              <button
                className="player__overlay-btn"
                onClick={handleNextStreamCandidate}
                aria-label="Try alternate stream candidate"
              >
                Alternate Stream ↻
              </button>
            )}
            {streamUrl && isSlowConnecting && (
              <button
                className="player__overlay-btn player__overlay-btn--retry"
                onClick={handleRetry}
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
              {channelStreams.length > 1
                ? `Tried all ${channelStreams.length} stream candidates directly and via edge proxy.`
                : isProxied
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
            <button
              className="player__overlay-btn player__overlay-btn--retry"
              onClick={handleRetry}
            >
              Retry ↺
            </button>
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
                onClick={goToNextChannel}
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
          {channelStreams.length > 1 && (
            <button
              className="player__stream-badge-btn"
              onClick={handleNextStreamCandidate}
              title={`Candidate ${activeStreamIdx + 1} of ${channelStreams.length} · Click to cycle`}
              aria-label="Switch stream candidate"
            >
              <span>Candidate {activeStreamIdx + 1}/{channelStreams.length}</span>
            </button>
          )}
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
              onClick={goToPrevChannel}
              disabled={allChannels.length <= 1}
              aria-label="Previous channel"
            >
              ◀ <span className="player__ch-label">{prevChannel?.name ?? '—'}</span>
            </button>

            <div className="player__ch-center">
              <span className="player__ch-number">
                CH {channelIdx >= 0 ? channelIdx + 1 : 1} of {allChannels.length}
              </span>
            </div>

            <button
              className="player__ch-btn"
              onClick={goToNextChannel}
              disabled={allChannels.length <= 1}
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
                  targetChannelIdRef.current = c.id
                  switchChannelCleanly(c)
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
