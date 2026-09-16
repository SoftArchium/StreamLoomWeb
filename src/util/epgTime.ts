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
  /** True when the anchor was pulled back because the feed is stale. */
  stale: boolean
  /** Minutes from origin to the anchor (the "now" marker unless stale). */
  anchorOffset: number
}

/**
 * Builds the visible time window.
 *
 * The grid is anchored `leadMinutes` (default `GRID_BACK_MINUTES`) before
 * `anchor` and runs `spanOverride` (default `GRID_BACK_MINUTES +
 * GRID_FORWARD_MINUTES`) past that origin, which puts the anchor on screen with
 * a little history behind it.
 *
 * A stale feed overrides both: it starts at the data and spans forward from
 * there, because there is no "now" to sit behind.
 */
export function buildGuideWindow(
  anchor: Date,
  stale = false,
  spanOverride?: number,
  leadMinutes?: number,
): GuideWindow {
  const step = 30 * 60 * 1000
  const lead = leadMinutes ?? GRID_BACK_MINUTES
  const rawOrigin = anchor.getTime() - lead * 60 * 1000
  // Stale windows anchor exactly on a programme boundary; live windows are
  // floored to the half hour so the hour ruler lands on whole labels.
  const origin = stale ? rawOrigin : Math.floor(rawOrigin / step) * step
  const span =
    spanOverride !== undefined
      ? Math.ceil(spanOverride / 30) * 30
      : lead + GRID_FORWARD_MINUTES
  const anchorOffset = (anchor.getTime() - origin) / 60_000
  return {
    origin,
    span,
    width: span * PIXELS_PER_MINUTE,
    nowOffset: anchorOffset,
    stale,
    anchorOffset,
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
