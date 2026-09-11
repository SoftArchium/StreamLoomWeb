import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import { useEpg } from '../hooks/useChannels'
import './VideoPlayer.css'

interface Props {
  channel: EnrichedChannel
  allChannels: EnrichedChannel[]
}

function getCurrentProgram(programs: EpgProgram[]): EpgProgram | undefined {
  const now = Date.now()
  return programs.find((p) => {
    const start = new Date(p.start_time).getTime()
    const end = new Date(p.end_time).getTime()
    return now >= start && now < end
  })
}

export function VideoPlayer({ channel, allChannels }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const navigate = useNavigate()
  const { programs } = useEpg(channel.id)

  const streamUrl = channel.stream?.url

  const loadStream = useCallback((url: string) => {
    const video = videoRef.current
    if (!video) return

    // Destroy previous HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
      })
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS on Safari / iOS
      video.src = url
      video.play().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (streamUrl) loadStream(streamUrl)
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [streamUrl, loadStream])

  // Keyboard navigation
  useEffect(() => {
    const currentIdx = allChannels.findIndex((c) => c.id === channel.id)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        const prev = allChannels.slice(0, currentIdx).reverse().find((c) => c.stream)
        if (prev) navigate(`/watch/${encodeURIComponent(prev.id)}`, { replace: true })
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        const next = allChannels.slice(currentIdx + 1).find((c) => c.stream)
        if (next) navigate(`/watch/${encodeURIComponent(next.id)}`, { replace: true })
      } else if (e.key === 'Escape') {
        navigate(-1)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [channel.id, allChannels, navigate])

  const nowPlaying = getCurrentProgram(programs)
  const nextProgram = programs.find((p) => new Date(p.start_time).getTime() > Date.now())

  return (
    <div className="player">
      <video
        ref={videoRef}
        className="player__video"
        autoPlay
        playsInline
        controls
      />

      {/* HUD overlay */}
      <div className="player__hud glass">
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
              <p className="player__next">
                Next: {nextProgram.title}
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="player__hint">← → to switch channels &nbsp;·&nbsp; Esc to go back</p>
    </div>
  )
}
