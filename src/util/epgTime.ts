/**
 * Time math for the TV guide grid.
 *
 * Everything is expressed in "minutes from the grid origin", a fixed point that
 * does not move while the guide is open. A stable origin is what lets program
 * boxes and the now-line share one coordinate space instead of each row
 * recomputing positions from wall-clock midnight.
 */

/** Minutes the grid shows before the current time. */
export const GRID_BACK_MINUTES = 60

/** Minutes the grid shows after the current time. */
export const GRID_FORWARD_MINUTES = 12 * 60

/** Horizontal scale. 3px/min keeps a 13-hour grid under 2400px. */
export const PIXELS_PER_MINUTE = 3

/** Row height in px. Must match `--epg-row-h` in EpgGuide.css. */
export const ROW_HEIGHT = 60

/** Sidebar width in px. Must match `--epg-sidebar-w` in EpgGuide.css. */
export const SIDEBAR_WIDTH = 200

/** Milliseconds after which the guide re-anchors its "now" marker. */
export const NOW_REFRESH_MS = 60_000

export interface GuideWindow {
  /** Epoch ms of the grid's left edge. */
  origin: number
  /** Total minutes covered by the grid. */
  span: number
  /** Total width in px (span * PIXELS_PER_MINUTE). */
  width: number
  /** Minutes from origin to the current time. */
  nowOffset: number
}

/**
 * Builds the visible time window around `now`.
 *
 * The origin is floored to a 30-minute boundary so hour labels land on whole
 * hours and the grid does not jitter between renders.
 */
export function buildGuideWindow(now: Date): GuideWindow {
  const step = 30 * 60 * 1000
  const rawOrigin = now.getTime() - GRID_BACK_MINUTES * 60 * 1000
  const origin = Math.floor(rawOrigin / step) * step
  const span = GRID_BACK_MINUTES + GRID_FORWARD_MINUTES
  return {
    origin,
    span,
    width: span * PIXELS_PER_MINUTE,
    nowOffset: (now.getTime() - origin) / 60_000,
  }
}

/** Minutes from the window origin for an ISO timestamp (may be negative). */
export function offsetMinutes(iso: string, origin: number): number {
  return (new Date(iso).getTime() - origin) / 60_000
}

/** Formats an ISO timestamp as a local 24h clock label. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Hour labels that fall inside the window, with their minute offsets. */
export function hourMarks(window: GuideWindow): { minutes: number; label: string }[] {
  const marks: { minutes: number; label: string }[] = []
  const start = new Date(window.origin)
  start.setMinutes(0, 0, 0)
  if (start.getTime() < window.origin) start.setHours(start.getHours() + 1)

  for (let t = start.getTime(); t <= window.origin + window.span * 60_000; t += 3_600_000) {
    const minutes = (t - window.origin) / 60_000
    const d = new Date(t)
    marks.push({
      minutes,
      label: String(d.getHours()).padStart(2, '0') + ':00',
    })
  }
  return marks
}
