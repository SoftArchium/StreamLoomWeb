import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import { fetchEpg } from '../api/supabase'
import './EpgGuide.css'

interface Props {
  channels: EnrichedChannel[]
  epgChannelIds: Set<string>
}

const PIXELS_PER_MINUTE = 4

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function minutesSinceMidnight(iso: string) {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function EpgGuide({ channels, epgChannelIds }: Props) {
  const navigate = useNavigate()
  const guideChannels = useMemo(
    () => channels.filter((ch) => epgChannelIds.has(ch.id) && ch.stream),
    [channels, epgChannelIds]
  )
  const [epgMap, setEpgMap] = useState<Map<string, EpgProgram[]>>(new Map())
  const [loadedCount, setLoadedCount] = useState(0)
  const timelineRef = useRef<HTMLDivElement>(null)

  const VISIBLE = 30
  const visibleChannels = useMemo(() => guideChannels.slice(0, VISIBLE), [guideChannels])
  const channelIdsKey = useMemo(() => visibleChannels.map((c) => c.id).join(','), [visibleChannels])

  // Fetch EPG for channels
  useEffect(() => {
    let cancelled = false

    async function load() {
      const batchSize = 5
      for (let i = 0; i < visibleChannels.length; i += batchSize) {
        if (cancelled) break
        const batch = visibleChannels.slice(i, i + batchSize)
        const results = await Promise.all(
          batch.map(async (ch) => {
            try {
              const data = await fetchEpg(ch.id)
              return { id: ch.id, data }
            } catch {
              return { id: ch.id, data: [] }
            }
          })
        )

        if (cancelled) break

        setEpgMap((prev) => {
          const next = new Map(prev)
          for (const item of results) {
            next.set(item.id, item.data)
          }
          return next
        })
        setLoadedCount((n) => Math.min(n + batchSize, visibleChannels.length))
      }
    }

    if (visibleChannels.length > 0) {
      load()
    }

    return () => {
      cancelled = true
    }
  }, [channelIdsKey, visibleChannels])

  // Scroll to current time
  useEffect(() => {
    const offset = nowMinutes() * PIXELS_PER_MINUTE - 120
    timelineRef.current?.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' })
  }, [])

  const hours = Array.from({ length: 24 }, (_, h) => h)
  const [now] = useState(() => nowMinutes())
  const guidePlaylist = useMemo(() => visibleChannels.map((c) => c.id), [visibleChannels])

  // Restore focus to last viewed channel on return to guide
  useEffect(() => {
    const targetId = sessionStorage.getItem('sl_last_viewed')
    if (!targetId || visibleChannels.length === 0) return

    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-channel-id="${targetId}"]`) as HTMLElement | null
      if (el) {
        el.focus({ preventScroll: false })
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [visibleChannels.length])

  return (
    <div className="epg-guide">
      <div className="epg-guide__header glass">
        <div className="epg-guide__sidebar-spacer">Channels</div>
        <div className="epg-guide__timeline-header" ref={timelineRef}>
          {hours.map((h) => (
            <div
              key={h}
              className="epg-guide__hour-label"
              style={{ left: h * 60 * PIXELS_PER_MINUTE }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
          <div
            className="epg-guide__now-line"
            style={{ left: now * PIXELS_PER_MINUTE }}
          />
        </div>
      </div>

      <div className="epg-guide__body">
        {loadedCount < visibleChannels.length && (
          <div className="epg-guide__loading">
            Loading schedules… {loadedCount}/{visibleChannels.length}
          </div>
        )}

        {visibleChannels.map((ch) => {
          const programs = epgMap.get(ch.id) ?? []
          return (
            <div key={ch.id} className="epg-guide__row">
              {/* Channel sidebar */}
              <div
                className="epg-guide__channel-cell glass"
                data-channel-id={ch.id}
                onClick={() => {
                  sessionStorage.setItem('sl_last_viewed', ch.id)
                  navigate(`/watch/${encodeURIComponent(ch.id)}`, {
                    state: {
                      playlist: guidePlaylist,
                      returnTo: '/guide',
                    },
                  })
                }}
                role="button"
                tabIndex={0}
              >
                {ch.logo ? (
                  <img src={ch.logo} alt={ch.name} className="epg-guide__channel-logo" loading="lazy" />
                ) : (
                  <span className="epg-guide__channel-initials">
                    {ch.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="epg-guide__channel-name">{ch.name}</span>
              </div>

              {/* Programs timeline */}
              <div className="epg-guide__programs">
                {programs.map((prog) => {
                  const startMin = minutesSinceMidnight(prog.start_time)
                  const endMin = minutesSinceMidnight(prog.end_time)
                  const width = Math.max((endMin - startMin) * PIXELS_PER_MINUTE, 60)
                  const left = startMin * PIXELS_PER_MINUTE
                  const isNow = now >= startMin && now < endMin

                  return (
                    <div
                      key={prog.id}
                      className={`epg-guide__program ${isNow ? 'epg-guide__program--now' : ''}`}
                      style={{ left, width }}
                      title={`${formatTime(prog.start_time)} – ${prog.title}`}
                      onClick={() => {
                        sessionStorage.setItem('sl_last_viewed', ch.id)
                        navigate(`/watch/${encodeURIComponent(ch.id)}`, {
                          state: {
                            playlist: guidePlaylist,
                            returnTo: '/guide',
                          },
                        })
                      }}
                    >
                      <span className="epg-guide__prog-title">{prog.title}</span>
                      <span className="epg-guide__prog-time">{formatTime(prog.start_time)}</span>
                    </div>
                  )
                })}
                {programs.length === 0 && epgMap.has(ch.id) && (
                  <div className="epg-guide__no-prog">No schedule data available</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
