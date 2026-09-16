import channelFallback from '../assets/channel-fallback.svg'
import { scheduleIconBackfill, getResolvedIcon } from './iconResolver'

/**
 * Channel icon helpers.
 *
 * Every `channels.logo` value is served from our own CDN as a 128px WebP:
 *   https://icons.softarchium.com/<channel-id>.webp
 *
 * The object name is the channel id and the CDN sends
 * `Cache-Control: public, max-age=31536000, immutable`, so:
 * - URLs are used verbatim — never append cache-busting params or timestamps.
 * - The 128px WebP is requested as-is and scaled by CSS; no larger variant.
 * - A null logo renders locally — it must never cost a network request.
 *
 * When the CDN has no object for a channel, a replacement is looked up in the
 * background and stored in R2 (see `iconResolver`), then served from `/api/icons`.
 */

/** Intrinsic size of the CDN WebP (long edge), used to reserve layout space. */
export const LOGO_SIZE = 128

/** Bundled placeholder swapped in when a request genuinely fails. */
export const FALLBACK_LOGO = channelFallback

/**
 * Returns the logo URL to render, or null when there is nothing to fetch.
 *
 * A resolved R2 icon takes precedence over the CDN URL: once an icon has been
 * backfilled it is known-good, so it is rendered without a miss first. A null
 * result means "render the local fallback immediately" — no request.
 */
export function logoUrl(
  logo: string | null | undefined,
  channelId?: string,
): string | null {
  if (channelId) {
    const resolved = getResolvedIcon(channelId)
    if (resolved) return resolved
  }
  if (typeof logo !== 'string') return null
  const trimmed = logo.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * `onError` handler for channel logo images. Swaps in the bundled placeholder
 * once; subsequent errors on the same element are ignored (no loop, no blank
 * tile). The data flag keeps this allocation-free per render.
 *
 * A miss is also the trigger for the background backfill, which is fire-and-forget
 * so the placeholder paints immediately and the callback never blocks the error
 * path.
 */
export function handleLogoError(event: React.SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget
  if (img.dataset.fallbackApplied === '1') return
  img.dataset.fallbackApplied = '1'
  img.src = FALLBACK_LOGO

  const channelId = img.dataset.channelId
  if (channelId) {
    scheduleIconBackfill(channelId, img.dataset.channelName || '', img.dataset.channelCountry || null)
  }
}

/**
 * Props to spread onto a channel logo `<img>` so a miss can be attributed to a
 * channel. Keeps the backfill wiring in one place instead of at each call site.
 */
export function logoDataAttrs(
  channelId: string,
  name: string,
  country: string | null | undefined,
): Record<string, string> {
  return {
    'data-channel-id': channelId,
    'data-channel-name': name,
    'data-channel-country': country || '',
  }
}

