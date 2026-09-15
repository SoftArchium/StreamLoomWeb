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
}

/** Programs narrower than this still render as a readable sliver. */
const MIN_WIDTH = 44

/**
 * One programme cell.
 *
 * Positioned in the grid's own coordinate space (minutes from the window
 * origin), so it stays aligned with the ruler and the now-line at every scroll
 * position.
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
}: Props) {
  // Re-reads the cache whenever a batch of translations lands.
  useTranslationVersion()

  useEffect(() => {
    if (translate) requestTranslations([program.title])
  }, [translate, program.title])

  const start = offsetMinutes(program.start_time, origin)
  const end = offsetMinutes(program.end_time, origin)
  const width = Math.max((end - start) * PIXELS_PER_MINUTE - 2, MIN_WIDTH)
  const left = start * PIXELS_PER_MINUTE
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

