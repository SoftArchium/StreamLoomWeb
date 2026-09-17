/**
 * Channel text search — shared between Home, Guide and Favourites.
 *
 * The catalogue carries thousands of channels. Matching the search box against
 * them naively (lowercasing, NFD-stripping and calling `Intl.DisplayNames` per
 * channel per filter pass) costs ~25 ms of main-thread time per keystroke and
 * grows with the catalogue, because Home runs five filter passes per keystroke
 * and each pass re-derives the search predicate per channel.
 *
 * The fix:
 * - `normalizeSearch` strips case and diacritics once for the query.
 * - `searchHaystack` builds the comparable text for a channel once, then
 *   memoizes it on the channel object so subsequent keystrokes cost an
 *   `String.includes` each instead of an `Intl.DisplayNames.of()`.
 *
 * `WeakMap` keeps the memo scoped to the live objects; a fresh `enrichChannels`
 * pass (catalogue refresh) produces new objects, so stale entries clean up
 * themselves and there is no schema/version dance in IndexedDB.
 */

import type { EnrichedChannel } from '../api/types'
import { getCountryName } from './country'

/** Per-channel memo of the normalized searchable text. */
const haystacks = new WeakMap<EnrichedChannel, string>()

/**
 * Lowercases and strips diacritics so "espana" matches "España" and
 * "UNITED" matches "United".
 */
export function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Text this channel is matched against, normalized.
 *
 * Combines the channel name, country code and full country name so the same
 * query finds "CNN US", "CNN" picked under the 🇺🇸 United States filter, and
 * "espana" picking up Spain-locale names.
 */
export function searchHaystack(channel: EnrichedChannel): string {
  let hay = haystacks.get(channel)
  if (hay === undefined) {
    hay = normalizeSearch(
      `${channel.name} ${channel.country ?? ''} ${getCountryName(channel.country)}`,
    )
    haystacks.set(channel, hay)
  }
  return hay
}

/**
 * True when the channel matches the search query.
 *
 * `normalizedQuery` must already have been passed through `normalizeSearch` —
 * the caller's loop normalizes once instead of per channel, which is what
 * makes the per-keystroke cost drop from ~25 ms to ~2 ms.
 */
export function matchesSearch(channel: EnrichedChannel, normalizedQuery: string): boolean {
  return normalizedQuery === '' || searchHaystack(channel).includes(normalizedQuery)
}
