import type { EnrichedChannel } from '../api/types'

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

/**
 * Applies every active filter to `channels`. Mirrors the inline branch logic
 * in `facetBundle` so the cost stays predictable.
 */
export function applyFilters(
  channels: EnrichedChannel[],
  f: GuideFilters,
  matchSet: Set<string> | null,
): EnrichedChannel[] {
  if (!hasActiveFilters(f)) return channels
  const wantFav = f.favOnly
  const wantCountry = f.country
  const wantLanguage = f.language
  const wantCategory = f.category
  const wantQuality = f.quality !== 'All Quality'
  const qualityFilter = f.quality
  const favourites = f.favouriteIds
  const searchOn = matchSet !== null

  const out: EnrichedChannel[] = []
  for (const ch of channels) {
    if (searchOn && !matchSet!.has(ch.id)) continue
    if (wantFav && !favourites.has(ch.id)) continue
    if (wantCountry && ch.country !== wantCountry) continue
    if (wantLanguage && !(ch.languages ?? []).includes(wantLanguage)) continue
    if (wantCategory && !ch.categoryIds.includes(wantCategory)) continue
    if (wantQuality && !matchQuality(ch.stream?.quality, qualityFilter)) continue
    out.push(ch)
  }
  return out
}

/** Result of a single-pass facet computation over the channel set. */
export interface FacetBundle {
  country: Map<string, number>
  language: Map<string, number>
  category: Map<string, number>
  quality: Map<string, number>
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

/**
 * Computes counts for every facet in **a single walk** over `channels`.
 *
 * Replaces the previous four-walk-per-keystroke implementation that ran
 * `facetCounts(scope, filters, X)` once per facet. The match set and the
 * "exclude the facet's own selection" rule are honored inline per-facet
 * without re-running the full predicate four times — each row runs the
 * non-search checks once and the search check once.
 */
export function facetBundle(
  channels: EnrichedChannel[],
  f: GuideFilters,
  matchSet: Set<string> | null,
): FacetBundle {
  const country = new Map<string, number>()
  const language = new Map<string, number>()
  const category = new Map<string, number>()
  const quality = new Map<string, number>()

  // Snapshot the filter state once so the loop stays branch-light.
  const wantFav = f.favOnly
  const wantCountry = f.country
  const wantLanguage = f.language
  const wantCategory = f.category
  const wantQuality = f.quality !== 'All Quality'
  const qualityFilter = f.quality
  const favourites = f.favouriteIds
  const searchOn = matchSet !== null

  for (const ch of channels) {
    // Hard prerequisites: same on every facet, so fail-fast.
    if (searchOn && !matchSet!.has(ch.id)) continue
    if (wantFav && !favourites.has(ch.id)) continue

    const chCountry = ch.country
    const chLanguages = ch.languages ?? []
    const chCategoryIds = ch.categoryIds
    const chQuality = ch.stream?.quality

    // Country facet: every other filter applies, except the country filter itself.
    if (
      (!wantFav || favourites.has(ch.id)) &&
      (!wantLanguage || chLanguages.includes(wantLanguage)) &&
      (!wantCategory || chCategoryIds.includes(wantCategory)) &&
      (!wantQuality || matchQuality(chQuality, qualityFilter)) &&
      chCountry
    ) {
      bump(country, chCountry)
    }

    // Language facet: every other filter applies, except the language filter itself.
    if (chLanguages.length > 0) {
      if (
        (!wantFav || favourites.has(ch.id)) &&
        (!wantCountry || chCountry === wantCountry) &&
        (!wantCategory || chCategoryIds.includes(wantCategory)) &&
        (!wantQuality || matchQuality(chQuality, qualityFilter))
      ) {
        for (const code of chLanguages) bump(language, code)
      }
    }

    // Category facet: every other filter applies, except the category filter itself.
    if (chCategoryIds.length > 0) {
      if (
        (!wantFav || favourites.has(ch.id)) &&
        (!wantCountry || chCountry === wantCountry) &&
        (!wantLanguage || chLanguages.includes(wantLanguage)) &&
        (!wantQuality || matchQuality(chQuality, qualityFilter))
      ) {
        for (const id of chCategoryIds) bump(category, id)
      }
    }

    // Quality facet: every other filter applies, except the quality filter itself.
    if (chQuality) {
      if (
        (!wantFav || favourites.has(ch.id)) &&
        (!wantCountry || chCountry === wantCountry) &&
        (!wantLanguage || chLanguages.includes(wantLanguage)) &&
        (!wantCategory || chCategoryIds.includes(wantCategory))
      ) {
        for (const bucket of ['4K', 'FHD (1080p)', 'HD (720p)', 'SD']) {
          if (matchQuality(chQuality, bucket)) bump(quality, bucket)
        }
      }
    }
  }
  return { country, language, category, quality }
}

/**
 * Counts for one facet, computed against every *other* active filter.
 *
 * @deprecated Prefer `facetBundle` — it computes every facet in one walk.
 * Kept exported for any external consumer (none in-tree today); internally
 * each call still walks `channels` once, so a UI that calls this four times
 * pays four walks. New code should use `facetBundle`.
 */
export function facetCounts(
  channels: EnrichedChannel[],
  f: GuideFilters,
  facet: 'country' | 'language' | 'category' | 'quality',
  matchSet: Set<string> | null,
): Map<string, number> {
  const counts = new Map<string, number>()
  const wantFav = f.favOnly
  const wantCountry = f.country
  const wantLanguage = f.language
  const wantCategory = f.category
  const wantQuality = f.quality !== 'All Quality'
  const qualityFilter = f.quality
  const favourites = f.favouriteIds
  const searchOn = matchSet !== null

  for (const ch of channels) {
    if (searchOn && !matchSet!.has(ch.id)) continue
    if (facet === 'country') {
      if (wantFav && !favourites.has(ch.id)) continue
      if (wantLanguage && !(ch.languages ?? []).includes(wantLanguage)) continue
      if (wantCategory && !ch.categoryIds.includes(wantCategory)) continue
      if (wantQuality && !matchQuality(ch.stream?.quality, qualityFilter)) continue
      if (ch.country) counts.set(ch.country, (counts.get(ch.country) ?? 0) + 1)
    } else if (facet === 'language') {
      if (wantFav && !favourites.has(ch.id)) continue
      if (wantCountry && ch.country !== wantCountry) continue
      if (wantCategory && !ch.categoryIds.includes(wantCategory)) continue
      if (wantQuality && !matchQuality(ch.stream?.quality, qualityFilter)) continue
      for (const code of ch.languages ?? []) counts.set(code, (counts.get(code) ?? 0) + 1)
    } else if (facet === 'category') {
      if (wantFav && !favourites.has(ch.id)) continue
      if (wantCountry && ch.country !== wantCountry) continue
      if (wantLanguage && !(ch.languages ?? []).includes(wantLanguage)) continue
      if (wantQuality && !matchQuality(ch.stream?.quality, qualityFilter)) continue
      for (const id of ch.categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1)
    } else {
      if (wantFav && !favourites.has(ch.id)) continue
      if (wantCountry && ch.country !== wantCountry) continue
      if (wantLanguage && !(ch.languages ?? []).includes(wantLanguage)) continue
      if (wantCategory && !ch.categoryIds.includes(wantCategory)) continue
      const q = ch.stream?.quality
      if (q) {
        for (const bucket of ['4K', 'FHD (1080p)', 'HD (720p)', 'SD']) {
          if (matchQuality(q, bucket)) counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
        }
      }
    }
  }
  return counts
}
