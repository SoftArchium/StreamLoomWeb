import { memo, useEffect } from 'react'
import type { EpgProgram } from '../api/types'
import { PIXELS_PER_MINUTE, formatTime, offsetMinutes } from '../util/epgTime'
import {
  getTranslation,
  requestTranslations,
  useTranslationVersion,
} from '../util/translate'

interface Props {
  program: EpgProgram
  origin: number
  nowOffset: number
  translate: boolean
  onPick: (channelId: string) => void
  /**
   * Right edge of this programme's slot, in minutes from the origin.
   *
   * A programme's own end time is not enough: feeds publish gaps, overlaps and
   * duplicate boundaries, and honouring them literally makes boxes collide.
   * The row computes the next programme's start and passes it here, so every box
   * ends exactly where the following one begins.
   */
  slotEnd: number
}

/**
 * One programme cell.
 *
 * Positioned in the grid's own coordinate space (minutes from the window
 * origin), so it stays aligned with the ruler and the now-line at every scroll
 * position. Width comes from the row's slot calculation rather than the raw end
 * time, which is what keeps neighbouring boxes from overlapping.
 *
 * When translation is on the title is derived during render from the module
 * cache — subscribing to its version rather than mirroring it into state — so a
 * batch of translations lands in a single pass with no second render. The
 * original title is always kept as the tooltip.
 */
export const EpgProgramBox = memo(function EpgProgramBox({
  program,
  origin,
  nowOffset,
  translate,
  onPick,
  slotEnd,
}: Props) {
  // Re-reads the cache whenever a batch of translations lands.
  useTranslationVersion()

  useEffect(() => {
    if (translate) requestTranslations([program.title])
  }, [translate, program.title])

  const start = offsetMinutes(program.start_time, origin)
  const end = offsetMinutes(program.end_time, origin)
  // Snap to the pixel grid: `slotEnd` comes from the next programme's snapped
  // start, so the left edge must be snapped the same way or the two disagree by
  // a sub-pixel and adjacent boxes can still clip each other.
  const left = Math.round(start * PIXELS_PER_MINUTE)
  // Exact fit to the slot the row allocated. A minimum width would push the box
  // into its neighbour, which is precisely the overlap this grid must not have;
  // very short programmes stay legible through the title tooltip instead.
  const width = Math.max(Math.round(slotEnd * PIXELS_PER_MINUTE) - left - GUTTER, 0)
  const isNow = nowOffset >= start && nowOffset < end

  const translated = translate ? getTranslation(program.title) : null
  const title = translated ?? program.title
  const time = formatTime(program.start_time)

  return (
    <div
      className={`epg-guide__program${isNow ? ' epg-guide__program--now' : ''}`}
      style={{ transform: `translateX(${left}px)`, width }}
      title={`${time} – ${program.title}${program.description ? '\n' + program.description : ''}`}
      onClick={() => onPick(program.channel_id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPick(program.channel_id)
        }
      }}
    >
      <span className="epg-guide__prog-title">{title}</span>
      {width > 90 && <span className="epg-guide__prog-time">{time}</span>}
    </div>
  )
})

/** Gap kept between adjacent boxes, in px. */
const GUTTER = 2


