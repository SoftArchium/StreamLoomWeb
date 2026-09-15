import { memo } from 'react'
import type { EnrichedChannel, EpgProgram } from '../api/types'
import { LOGO_SIZE, logoUrl, handleLogoError } from '../util/logo'
import { GRID_FORWARD_MINUTES, offsetMinutes } from '../util/epgTime'
import { EpgProgramBox } from './EpgProgramBox'

interface Props {
  channel: EnrichedChannel
  programs: EpgProgram[]
  origin: number
  nowOffset: number
  translate: boolean
  sidebarWidth: number
  rowHeight: number
  /** Absolute row offset inside the virtualized spacer, in px. */
  top: number
  onPick: (channelId: string) => void
}

/** How far before the grid start a row still renders a programme tail. */
const LEAD_MINUTES = 15

/**
 * One channel row of the guide.
 *
 * Memoized on its props so a schedule arriving for channel B never re-renders
 * channel A — the single largest source of jank in the previous implementation,
 * which rewrote one big map and re-rendered every row on each batch.
 *
 * Programs are windowed horizontally too: anything that ended well before the
 * grid starts, or begins after the last visible hour, is skipped instead of
 * being laid out off-screen where it still costs layout and paint.
 */
export const EpgRow = memo(function EpgRow({
  channel,
  programs,
  origin,
  nowOffset,
  translate,
  sidebarWidth,
  rowHeight,
  top,
  onPick,
}: Props) {
  const logoSrc = logoUrl(channel.logo)
  const gridStart = -LEAD_MINUTES
  const gridEnd = nowOffset + GRID_FORWARD_MINUTES

  const visible =
    programs.length > 0
      ? programs.filter(
          (p) =>
            offsetMinutes(p.end_time, origin) > gridStart &&
            offsetMinutes(p.start_time, origin) < gridEnd,
        )
      : programs

  return (
    <div
      className="epg-guide__row"
      style={{ transform: `translateY(${top}px)`, height: rowHeight }}
    >
      <div
        className="epg-guide__channel"
        style={{ width: sidebarWidth }}
        onClick={() => onPick(channel.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPick(channel.id)
          }
        }}
        role="button"
        tabIndex={0}
        title={channel.name}
        data-channel-id={channel.id}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt=""
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            decoding="async"
            loading="lazy"
            onError={handleLogoError}
            className="epg-guide__channel-logo"
          />
        ) : (
          <span className="epg-guide__channel-initials">
            {channel.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="epg-guide__channel-name">{channel.name}</span>
      </div>

      <div className="epg-guide__programs">
        {visible.length > 0 ? (
          visible.map((prog) => (
            <EpgProgramBox
              key={prog.id}
              program={prog}
              origin={origin}
              nowOffset={nowOffset}
              translate={translate}
              onPick={onPick}
            />
          ))
        ) : (
          <span className="epg-guide__no-prog">No schedule data</span>
        )}
      </div>
    </div>
  )
})

