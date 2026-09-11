import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import { fetchEpg } from '../api/supabase'
import './EpgGuide.css'

interface Props {
  channels: EnrichedChannel[]
  epgChannelIds: Set<string>
}

// HOURS_TO_SHOW and PIXELS_PER_MINUTE control the width of the timeline
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
  const guideChannels = channels.filter((ch) => epgChannelIds.has(ch.id) && ch.stream)
  const [epgMap, setEpgMap] = useState<Map<string, EpgProgram[]>>(new Map())
  const [loadedCount, setLoadedCount] = useState(0)
  const timelineRef = useRef<HTMLDivElement>(null)

  const VISIBLE = 30 // Load first 30 channels' EPG
  const visibleChannels = guideChannels.slice(0, VISIBLE)

  const loadEpg = useCallback(async () => {
    const batchSize = 5
    for (let i = 0; i < visibleChannels.length; i += batchSize) {
      const batch = visibleChannels.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (ch) => {
          if (epgMap.has(ch.id)) return
          const programs = await fetchEpg(ch.id)
          setEpgMap((prev) => new Map(prev).set(ch.id, programs))
        })
      )
      setLoadedCount((n) => Math.min(n + batchSize, visibleChannels.length))
    }
  }, [visibleChannels, epgMap])

  useEffect(() => {
    if (visibleChannels.length > 0) loadEpg()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChannels.length])

  // Scroll to current time
  useEffect(() => {
    const offset = nowMinutes() * PIXELS_PER_MINUTE - 80
    timelineRef.current?.scrollTo({ left: offset, behavior: 'smooth' })
  }, [])

  // Build hour labels for the header (from midnight)
  const hours = Array.from({ length: 24 }, (_, h) => h)

  const now = nowMinutes()

  return (
    <div className="epg-guide">
      <div className="epg-guide__header glass">
        <div className="epg-guide__sidebar-spacer" />
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
          {/* Current time indicator */}
          <div
            className="epg-guide__now-line"
            style={{ left: now * PIXELS_PER_MINUTE }}
          />
        </div>
      </div>

      <div className="epg-guide__body">
        {loadedCount < visibleChannels.length && (
          <div className="epg-guide__loading">
            Loading guide… {loadedCount}/{visibleChannels.length}
          </div>
        )}

        {visibleChannels.map((ch) => {
          const programs = epgMap.get(ch.id) ?? []
          return (
            <div key={ch.id} className="epg-guide__row">
              {/* Channel sidebar */}
              <div
                className="epg-guide__channel-cell glass"
                onClick={() => navigate(`/watch/${encodeURIComponent(ch.id)}`)}
                role="button"
                tabIndex={0}
              >
                {ch.logo ? (
                  <img src={ch.logo} alt={ch.name} className="epg-guide__channel-logo" />
                ) : (
                  <span className="epg-guide__channel-initials">
                    {ch.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="epg-guide__channel-name">{ch.name}</span>
              </div>

              {/* Programs */}
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
                      onClick={() => navigate(`/watch/${encodeURIComponent(ch.id)}`)}
                    >
                      <span className="epg-guide__prog-title">{prog.title}</span>
                      <span className="epg-guide__prog-time">{formatTime(prog.start_time)}</span>
                    </div>
                  )
                })}
                {programs.length === 0 && epgMap.has(ch.id) && (
                  <div className="epg-guide__no-prog">No schedule data</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
