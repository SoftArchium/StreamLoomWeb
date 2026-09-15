import { memo } from 'react'
import { PIXELS_PER_MINUTE } from '../util/epgTime'

interface Props {
  marks: { minutes: number; label: string }[]
  gridWidth: number
  nowOffset: number
  sidebarWidth: number
}

/**
 * Sticky time ruler above the grid.
 *
 * The ruler lives inside the same scroll container as the rows, so it can never
 * drift out of alignment with them — the failure mode that made the previous
 * per-row scrolling guide overlap.
 */
export const EpgTimeline = memo(function EpgTimeline({
  marks,
  gridWidth,
  nowOffset,
  sidebarWidth,
}: Props) {
  return (
    <div className="epg-guide__timeline glass">
      <div className="epg-guide__timeline-corner" style={{ width: sidebarWidth }}>
        <span className="epg-guide__timeline-corner-label">CHANNEL</span>
      </div>
      <div className="epg-guide__timeline-track" style={{ width: gridWidth }}>
        {marks.map((mark) => (
          <div
            key={mark.minutes}
            className="epg-guide__hour"
            style={{ transform: `translateX(${mark.minutes * PIXELS_PER_MINUTE}px)` }}
          >
            <span className="epg-guide__hour-label">{mark.label}</span>
          </div>
        ))}
        <div
          className="epg-guide__now-flag"
          style={{ transform: `translateX(${nowOffset * PIXELS_PER_MINUTE}px)` }}
        >
          <span className="epg-guide__now-flag-label">NOW</span>
        </div>
      </div>
    </div>
  )
})
