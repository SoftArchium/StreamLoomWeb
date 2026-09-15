import type { EnrichedChannel } from '../api/types'
import { getCountryName } from './country'

/**
 * Filter state for the TV guide toolbar.
 *
 * The toolbar receives state and setters in one object so it takes a single
 * prop, and so the grid can memoize on that object's identity: a new object
 * always means new results.
 */
export interface GuideFilterState {
  search: string
  country: string | null
  language: string | null
  category: string | null
  quality: string
  favOnly: boolean
  favouriteIds: Set<string>
}

/** Filter state plus the handlers the toolbar calls. */
export interface GuideFilters extends GuideFilterState {
  onSearch: (value: string) => void
  onCountry: (value: string | null) => void
  onLanguage: (value: string | null) => void
  onCategory: (value: string | null) => void
  onQuality: (value: string) => void
  onToggleFav: () => void
  onClear: () => void
}

export const EMPTY_FILTER_STATE: GuideFilterState = {
  search: '',
  country: null,
  language: null,
  category: null,
  quality: 'All Quality',
  favOnly: false,
  favouriteIds: new Set(),
}

/** Mirrors the Home page's resolution buckets so both surfaces agree. */
export function matchQuality(quality: string | null | undefined, filter: string): boolean {
  if (!filter || filter === 'All Quality') return true
  if (!quality) return false
  const q = quality.toLowerCase()
  if (filter === '4K') return q.includes('4k') || q.includes('2160') || q.includes('uhd')
  if (filter.startsWith('FHD')) return q.includes('1080') || q.includes('fhd')
  if (filter.startsWith('HD')) return q.includes('720') || q.includes('hd')
  if (filter === 'SD') return q.includes('480') || q.includes('576') || q.includes('360') || q.includes('sd')
  return true
}

/** True when any facet or search term is narrowing the guide. */
export function hasActiveFilters(f: GuideFilters): boolean {
  return (
    Boolean(f.search.trim()) ||
    Boolean(f.country) ||
    Boolean(f.language) ||
    Boolean(f.category) ||
    f.quality !== 'All Quality' ||
    f.favOnly
  )
}

/** Number of facets currently applied, for the toolbar badge. */
export function activeFilterCount(f: GuideFilters): number {
  return (
    (f.search.trim() ? 1 : 0) +
    (f.country ? 1 : 0) +
    (f.language ? 1 : 0) +
    (f.category ? 1 : 0) +
    (f.quality !== 'All Quality' ? 1 : 0) +
    (f.favOnly ? 1 : 0)
  )
}

/** Lowercases and strips diacritics so "espana" matches "España". */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Single predicate used by both the results and the facet counts. */
function matches(ch: EnrichedChannel, f: GuideFilters, exclude: keyof GuideFilters | null): boolean {
  if (f.favOnly && exclude !== 'favOnly' && !f.favouriteIds.has(ch.id)) return false
  if (f.country && exclude !== 'country' && ch.country !== f.country) return false
  if (f.language && exclude !== 'language' && !(ch.languages ?? []).includes(f.language)) return false
  if (f.category && exclude !== 'category' && !ch.categoryIds.includes(f.category)) return false
  if (f.quality !== 'All Quality' && exclude !== 'quality' && !matchQuality(ch.stream?.quality, f.quality)) {
    return false
  }

  const q = normalize(f.search.trim())
  if (q && exclude !== 'search') {
    const name = normalize(ch.name)
    const code = normalize(ch.country ?? '')
    if (!name.includes(q) && !code.includes(q) && !normalize(getCountryName(ch.country)).includes(q)) {
      return false
    }
  }
  return true
}

/** Applies every active filter to `channels`. */
export function applyFilters(channels: EnrichedChannel[], f: GuideFilters): EnrichedChannel[] {
  if (!hasActiveFilters(f)) return channels
  return channels.filter((ch) => matches(ch, f, null))
}

export interface FacetOption {
  value: string
  label: string
  count: number
}

/**
 * Counts for one facet, computed against every *other* active filter.
 *
 * This is what keeps the dropdowns honest: choosing "News" still shows how many
 * Spanish, English or Hindi news channels there are rather than collapsing the
 * counts to the current selection.
 */
export function facetCounts(
  channels: EnrichedChannel[],
  f: GuideFilters,
  facet: 'country' | 'language' | 'category' | 'quality',
): Map<string, number> {
  const counts = new Map<string, number>()
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)

  for (const ch of channels) {
    if (!matches(ch, f, facet === 'quality' ? 'quality' : facet)) continue
    if (facet === 'country') {
      if (ch.country) bump(ch.country)
    } else if (facet === 'language') {
      for (const code of ch.languages ?? []) bump(code)
    } else if (facet === 'category') {
      for (const id of ch.categoryIds) bump(id)
    } else {
      for (const bucket of ['4K', 'FHD (1080p)', 'HD (720p)', 'SD']) {
        if (matchQuality(ch.stream?.quality, bucket)) bump(bucket)
      }
    }
  }
  return counts
}
