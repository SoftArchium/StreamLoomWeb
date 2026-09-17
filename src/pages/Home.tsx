import { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react'
import { useLocation } from 'react-router-dom'
import { useChannels, useFavourites, useRecent } from '../hooks/useChannels'
import type { EnrichedChannel } from '../hooks/useChannels'
import { HeroSection } from '../components/HeroSection'
import { CategoryRow } from '../components/CategoryRow'
import { SearchBar } from '../components/SearchBar'
import { ChannelCard } from '../components/ChannelCard'
import { FilterSheet } from '../components/FilterSheet'
import { useKeyboardNav } from '../hooks/useKeyboardNav'
import { getCountryName, getCountryFlag, formatCountryDisplay } from '../util/country'
import { getLanguageName } from '../util/language'
import { matchesSearch, normalizeSearch } from '../util/searchText'
import './Home.css'

const PRIORITY_CATEGORIES = ['music', 'movies', 'cartoons', 'comedy', 'news', 'sports']

const CATEGORY_ICONS: Record<string, string> = {
  music: '🎵',
  movies: '🎬',
  cartoons: '🦄',
  kids: '🧸',
  comedy: '😂',
  news: '📰',
  sports: '⚽',
  documentary: '🌍',
  entertainment: '🍿',
  lifestyle: '✨',
  general: '📺',
  series: '🎞️',
  auto: '🏎️',
  science: '🔬',
  travel: '✈️',
  cooking: '🍳',
  family: '👨‍👩‍👧',
  classic: '📻',
  business: '💼',
}

function matchQuality(quality: string | null | undefined, filter: string): boolean {
  if (!filter || filter === 'All Quality') return true
  if (!quality) return false
  const q = quality.toLowerCase()
  if (filter === '4K') return q.includes('4k') || q.includes('2160') || q.includes('uhd')
  if (filter.startsWith('FHD')) return q.includes('1080') || q.includes('fhd')
  if (filter.startsWith('HD')) return q.includes('720') || q.includes('hd')
  if (filter === 'SD') return q.includes('480') || q.includes('576') || q.includes('360') || q.includes('sd')
  return true
}

const GRID_BATCH_SIZE = 36

export function Home() {
  const location = useLocation()
  const { channels, categories, loading, error, refresh } = useChannels()
  const { favouriteIds } = useFavourites()
  const { recentIds, addRecent } = useRecent()

  // Initialize filters from sessionStorage so they are preserved upon returning from player
  const [search, setSearch] = useState(() => sessionStorage.getItem('sl_active_search') || '')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() =>
    sessionStorage.getItem('sl_active_cat'),
  )
  const [selectedCountry, setSelectedCountry] = useState<string | null>(() =>
    sessionStorage.getItem('sl_active_country'),
  )
  const [selectedQuality, setSelectedQuality] = useState<string>(
    () => sessionStorage.getItem('sl_active_quality') || 'All Quality',
  )
  const [showFavOnly, setShowFavOnly] = useState<boolean>(
    () => sessionStorage.getItem('sl_active_fav') === 'true',
  )
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(() =>
    sessionStorage.getItem('sl_active_lang'),
  )
  const [userExpandedLimit, setUserExpandedLimit] = useState(0)
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)

  const categoriesScrollRef = useRef<HTMLDivElement>(null)

  const playableChannels = useMemo(() => channels.filter((c) => c.stream), [channels])

  // Pre-index channels by category for row mode lookups (built from the
  // unfiltered playable list so each row keeps its full set when no filter is
  // active; the search/grid path derives its own list).
  const channelsByCategory = useMemo(() => {
    const map = new Map<string, EnrichedChannel[]>()
    for (const ch of playableChannels) {
      for (const catId of ch.categoryIds) {
        let list = map.get(catId)
        if (!list) {
          list = []
          map.set(catId, list)
        }
        list.push(ch)
      }
    }
    return map
  }, [playableChannels])

  // Non-search filters are stable enough that a single per-render derivation is
  // cheaper than recreating a callback. Each facet's "exclude self" semantics
  // are honored by passing the right exclusion flag.
  type FacetKey = 'country' | 'category' | 'language' | 'quality' | 'fav'
  const passesNonSearch = useCallback(
    (ch: EnrichedChannel, exclude: FacetKey | null): boolean => {
      if (showFavOnly && exclude !== 'fav' && !favouriteIds.has(ch.id)) return false
      if (selectedCountry && exclude !== 'country' && ch.country !== selectedCountry) return false
      if (selectedCategory && exclude !== 'category' && !ch.categoryIds.includes(selectedCategory)) return false
      if (selectedLanguage && exclude !== 'language' && !(ch.languages ?? []).includes(selectedLanguage)) return false
      if (selectedQuality !== 'All Quality' && exclude !== 'quality' && !matchQuality(ch.stream?.quality, selectedQuality)) return false
      return true
    },
    [showFavOnly, favouriteIds, selectedCountry, selectedCategory, selectedLanguage, selectedQuality],
  )

  /**
   * The search box drives two parallel states:
   * - `search`: the live React state, updated every keystroke, used for the
   *   cheap title-bar count.
   * - `deferredSearch`: React's `useDeferredValue` mirror, lagging behind
   *   `search` during fast typing. Heavy work (facets, grid, row mode swap)
   *   reads from `deferredSearch` so the input never stalls.
   */
  const deferredSearch = useDeferredValue(search)
  const normalizedSearch = useMemo(
    () => normalizeSearch(deferredSearch.trim()),
    [deferredSearch],
  )

  /**
   * The grid is the fully-filtered view (search + every non-search filter).
   * It feeds `activeGridChannels`, which the grid view and the search-result
   * title bar render. The facet dropdowns do NOT derive from this list; they
   * walk `playableChannels` themselves so a facet never pre-narrows by its
   * own value (matches the previous `filterChannels()` semantics).
   */
  const grid = useMemo(() => {
    const out: EnrichedChannel[] = []
    for (const ch of playableChannels) {
      if (!passesNonSearch(ch, null)) continue
      if (normalizedSearch && !matchesSearch(ch, normalizedSearch)) continue
      out.push(ch)
    }
    return out
  }, [playableChannels, passesNonSearch, normalizedSearch])

  const activeGridChannels = grid

  /**
   * Counts for one facet, evaluated against `playableChannels` with every
   * non-search filter applied EXCEPT the named facet's own filter AND with the
   * search predicate applied. This matches the previous `filterChannels()`
   * helper exactly: a search-narrowed, self-facet-excluded subset whose
   * keys/presence drive the dropdown.
   *
   * The cost: five walks over |playableChannels| on every keystroke, each
   * applying the haystack check (the only one that touches every channel).
   * The win comes from React's `useDeferredValue` on `search` above: the
   * input keeps painting at 60 fps while these five walks run in the deferred
   * tree, which means the user never waits for the worst-case render.
   */
  const collectCounts = useCallback(
    (
      exclude: FacetKey,
      key: (ch: EnrichedChannel) => Iterable<string>,
    ): Map<string, number> => {
      const counts = new Map<string, number>()
      for (const ch of playableChannels) {
        if (!passesNonSearch(ch, exclude)) continue
        if (normalizedSearch && !matchesSearch(ch, normalizedSearch)) continue
        for (const k of key(ch)) counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      return counts
    },
    [playableChannels, passesNonSearch, normalizedSearch],
  )

  // 1. Faceted Countries
  const countryCounts = useMemo(
    () => collectCounts('country', (ch) => (ch.country ? [ch.country] : [])),
    [collectCounts],
  )

  // 2. Faceted Categories
  const categoryCounts = useMemo(
    () => collectCounts('category', (ch) => ch.categoryIds),
    [collectCounts],
  )

  // 3. Faceted Languages
  const languageCounts = useMemo(
    () => collectCounts('language', (ch) => ch.languages ?? []),
    [collectCounts],
  )

  // 4. Faceted Qualities (presence per bucket, not counts)
  const qualityPresent = useMemo(() => {
    const present = { '4K': false, 'FHD (1080p)': false, 'HD (720p)': false, SD: false }
    for (const ch of playableChannels) {
      if (!passesNonSearch(ch, 'quality')) continue
      if (normalizedSearch && !matchesSearch(ch, normalizedSearch)) continue
      const q = ch.stream?.quality
      if (q && matchQuality(q, '4K')) present['4K'] = true
      if (q && matchQuality(q, 'FHD (1080p)')) present['FHD (1080p)'] = true
      if (q && matchQuality(q, 'HD (720p)')) present['HD (720p)'] = true
      if (q && matchQuality(q, 'SD')) present.SD = true
    }
    return present
  }, [playableChannels, passesNonSearch, normalizedSearch])

  const derived = { grid, countryCounts, categoryCounts, languageCounts, qualityPresent }

  // 1. Faceted Countries: only countries having channels in current subset, with full names & flags
  const availableCountries = useMemo(() => {
    return [...derived.countryCounts.keys()]
      .sort((a, b) => getCountryName(a).localeCompare(getCountryName(b)))
      .map((code) => ({
        code,
        name: getCountryName(code),
        flag: getCountryFlag(code),
        count: derived.countryCounts.get(code) ?? 0,
      }))
  }, [derived.countryCounts])

  // 2. Faceted Categories: only categories with channels in current subset, with dynamic counts
  const availableCategories = useMemo(() => {
    return categories
      .filter((cat) => (derived.categoryCounts.get(cat.id) ?? 0) > 0)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        count: derived.categoryCounts.get(cat.id) ?? 0,
      }))
      .sort((a, b) => {
        const aIndex = PRIORITY_CATEGORIES.indexOf(a.id.toLowerCase())
        const bIndex = PRIORITY_CATEGORIES.indexOf(b.id.toLowerCase())
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
        if (aIndex !== -1) return -1
        if (bIndex !== -1) return 1
        return a.name.localeCompare(b.name)
      })
  }, [categories, derived.categoryCounts])

  // 3. Faceted Languages: only languages present in the current subset
  const availableLanguages = useMemo(() => {
    return [...derived.languageCounts.keys()]
      .map((code) => ({ code, name: getLanguageName(code), count: derived.languageCounts.get(code) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [derived.languageCounts])

  // 4. Faceted Qualities: only qualities with channels in current subset
  const availableQualities = useMemo(() => {
    const result = ['All Quality']
    if (derived.qualityPresent['4K']) result.push('4K')
    if (derived.qualityPresent['FHD (1080p)']) result.push('FHD (1080p)')
    if (derived.qualityPresent['HD (720p)']) result.push('HD (720p)')
    if (derived.qualityPresent.SD) result.push('SD')
    return result
  }, [derived.qualityPresent])

  // Derive effective filter values ensuring they are valid within available faceted options
  const effectiveCountry = useMemo(() => {
    return selectedCountry && availableCountries.some((c) => c.code === selectedCountry)
      ? selectedCountry
      : null
  }, [selectedCountry, availableCountries])

  const effectiveCategory = useMemo(() => {
    return selectedCategory && availableCategories.some((c) => c.id === selectedCategory)
      ? selectedCategory
      : null
  }, [selectedCategory, availableCategories])

  const effectiveLanguage = useMemo(() => {
    return selectedLanguage && availableLanguages.some((l) => l.code === selectedLanguage)
      ? selectedLanguage
      : null
  }, [selectedLanguage, availableLanguages])

  const effectiveQuality = useMemo(() => {
    return availableQualities.includes(selectedQuality) ? selectedQuality : 'All Quality'
  }, [selectedQuality, availableQualities])

  const favouriteChannels = useMemo(
    () => playableChannels.filter((ch) => favouriteIds.has(ch.id)),
    [playableChannels, favouriteIds],
  )

  const recentChannels = useMemo(
    () =>
      recentIds
        .map((id) => playableChannels.find((ch) => ch.id === id))
        .filter(Boolean) as typeof playableChannels,
    [recentIds, playableChannels],
  )

  const handleWatch = useCallback((channelId: string) => addRecent(channelId), [addRecent])

  // Sync active filter selections to sessionStorage
  useEffect(() => {
    if (search) sessionStorage.setItem('sl_active_search', search)
    else sessionStorage.removeItem('sl_active_search')
  }, [search])

  useEffect(() => {
    if (effectiveCategory) sessionStorage.setItem('sl_active_cat', effectiveCategory)
    else sessionStorage.removeItem('sl_active_cat')
  }, [effectiveCategory])

  useEffect(() => {
    if (effectiveCountry) sessionStorage.setItem('sl_active_country', effectiveCountry)
    else sessionStorage.removeItem('sl_active_country')
  }, [effectiveCountry])

  useEffect(() => {
    if (effectiveQuality && effectiveQuality !== 'All Quality')
      sessionStorage.setItem('sl_active_quality', effectiveQuality)
    else sessionStorage.removeItem('sl_active_quality')
  }, [effectiveQuality])

  useEffect(() => {
    if (effectiveLanguage) sessionStorage.setItem('sl_active_lang', effectiveLanguage)
    else sessionStorage.removeItem('sl_active_lang')
  }, [effectiveLanguage])

  useEffect(() => {
    if (showFavOnly) sessionStorage.setItem('sl_active_fav', 'true')
    else sessionStorage.removeItem('sl_active_fav')
  }, [showFavOnly])

  const clearFilters = useCallback(() => {
    setSelectedCategory(null)
    setSelectedCountry(null)
    setSelectedQuality('All Quality')
    setSelectedLanguage(null)
    setShowFavOnly(false)
    setSearch('')
    setUserExpandedLimit(0)
    sessionStorage.removeItem('sl_active_cat')
    sessionStorage.removeItem('sl_active_country')
    sessionStorage.removeItem('sl_active_quality')
    sessionStorage.removeItem('sl_active_lang')
    sessionStorage.removeItem('sl_active_fav')
    sessionStorage.removeItem('sl_active_search')
  }, [])

  // Reset expanded limit when filters change
  const filterKey = `${selectedCategory}-${selectedCountry}-${selectedLanguage}-${selectedQuality}-${showFavOnly}-${search}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setUserExpandedLimit(0)
  }

  // Mouse wheel horizontal translation on category pill scroll
  useEffect(() => {
    const el = categoriesScrollRef.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 5) {
        e.preventDefault()
        el?.scrollBy({ left: e.deltaY * 1.5, behavior: 'auto' })
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // Enable keyboard navigation
  useKeyboardNav({ onEscape: clearFilters })

  const hasActiveFilter =
    Boolean(effectiveCategory) ||
    Boolean(effectiveLanguage) ||
    Boolean(effectiveCountry) ||
    effectiveQuality !== 'All Quality' ||
    showFavOnly ||
    Boolean(search.trim())

  const activeFilterCount =
    (effectiveLanguage ? 1 : 0) +
    (effectiveCountry ? 1 : 0) +
    (effectiveCategory ? 1 : 0) +
    (effectiveQuality !== 'All Quality' ? 1 : 0) +
    (showFavOnly ? 1 : 0)

  const isGridMode = hasActiveFilter || Boolean(search.trim())
  const activeGridPlaylist = useMemo(() => activeGridChannels.map((c) => c.id), [activeGridChannels])

  const targetId =
    (location.state as { targetChannelId?: string } | null)?.targetChannelId ||
    sessionStorage.getItem('sl_last_viewed')

  // Calculate effective gridLimit during render
  const gridLimit = useMemo(() => {
    let base = GRID_BATCH_SIZE + userExpandedLimit
    if (isGridMode && targetId) {
      const targetIdx = activeGridChannels.findIndex((c) => c.id === targetId)
      if (targetIdx >= 0) {
        const needed = Math.ceil((targetIdx + 1) / GRID_BATCH_SIZE) * GRID_BATCH_SIZE
        base = Math.max(base, needed)
      }
    }
    return base
  }, [userExpandedLimit, isGridMode, targetId, activeGridChannels])

  // Restore focus and scroll into view when returning from watching a channel
  useEffect(() => {
    if (!targetId || playableChannels.length === 0) return

    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-channel-id="${targetId}"]`) as HTMLElement | null
      if (el) {
        el.focus({ preventScroll: false })
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [targetId, playableChannels.length])

  if (error) {
    return (
      <div className="home-error">
        <p>⚠️ {error}</p>
        <button onClick={refresh}>Retry</button>
      </div>
    )
  }

  return (
    <div className="page-wrapper home-page">
      {loading && !channels.length ? (
        <div className="home-skeleton">
          <div className="skeleton" style={{ height: '40vh', marginBottom: 40, borderRadius: 28 }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ marginBottom: 40 }}>
              <div className="skeleton" style={{ height: 22, width: 180, marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 16 }}>
                {[1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="skeleton" style={{ width: 170, height: 140, borderRadius: 18 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Hero — only shown when no filters active */}
          {!hasActiveFilter && <HeroSection channels={playableChannels} />}

          {/* Filter / search toolbar */}
          <div className="home-toolbar">
            <div className="home-search-line">
              <SearchBar
                value={search}
                onChange={setSearch}
                resultCount={search.trim() ? activeGridChannels.length : undefined}
              />
              <button
                className={`home-filter-btn ${activeFilterCount > 0 ? 'home-filter-btn--active' : ''}`}
                onClick={() => setIsFilterSheetOpen(true)}
                aria-label="Open filter settings"
                title="Filter channels by country, category, resolution"
              >
                <span>🎛️ Filters</span>
                {activeFilterCount > 0 && <span className="home-filter-btn__badge">{activeFilterCount}</span>}
              </button>
            </div>
            {/* Active Filter Chips */}
            {hasActiveFilter && (
              <div className="home-active-chips">
                {showFavOnly && (
                  <button className="active-chip" onClick={() => setShowFavOnly(false)}>
                    <span>♥ Favourites</span>
                    <span className="active-chip__remove">✕</span>
                  </button>
                )}
                {effectiveCountry && (
                  <button className="active-chip" onClick={() => setSelectedCountry(null)}>
                    <span>{formatCountryDisplay(effectiveCountry)}</span>
                    <span className="active-chip__remove">✕</span>
                  </button>
                )}
                {effectiveCategory && (
                  <button className="active-chip" onClick={() => setSelectedCategory(null)}>
                    <span>
                      {categories.find((c) => c.id === effectiveCategory)?.name ?? effectiveCategory}
                    </span>
                    <span className="active-chip__remove">✕</span>
                  </button>
                )}
                {effectiveQuality !== 'All Quality' && (
                  <button className="active-chip" onClick={() => setSelectedQuality('All Quality')}>
                    <span>📺 {effectiveQuality}</span>
                    <span className="active-chip__remove">✕</span>
                  </button>
                )}
                <button className="active-chip__clear-all" onClick={clearFilters}>
                  Clear all
                </button>
              </div>
            )}

            <div className="home-filters-row">
              {/* Quick Desktop select dropdowns */}
              <div className="home-quick-filters">
                <button
                  className={`filter-pill ${showFavOnly ? 'filter-pill--active' : ''}`}
                  onClick={() => setShowFavOnly((v) => !v)}
                  title="Filter favourites"
                >
                  <span>♥ Favourites</span>
                  {favouriteChannels.length > 0 && (
                    <span className="filter-pill__count">{favouriteChannels.length}</span>
                  )}
                </button>

                {/* Desktop Quality Select */}
                <div className="filter-select-wrap">
                  <select
                    className={`filter-select ${effectiveQuality !== 'All Quality' ? 'filter-select--active' : ''}`}
                    value={effectiveQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                    aria-label="Filter by quality"
                  >
                    {availableQualities.map((r) => (
                      <option key={r} value={r}>
                        📺 {r}
                      </option>
                    ))}
                  </select>
                  <span className="filter-select-arrow">▼</span>
                </div>

                {/* Desktop Country Select with Flags and Full Names */}
                <div className="filter-select-wrap">
                  <select
                    className={`filter-select ${effectiveCountry ? 'filter-select--active' : ''}`}
                    value={effectiveCountry ?? ''}
                    onChange={(e) => setSelectedCountry(e.target.value || null)}
                    aria-label="Filter by country"
                  >
                    <option value="">🌍 All Countries ({availableCountries.length})</option>
                    {availableCountries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name} ({c.count})
                      </option>
                    ))}
                  </select>
                  <span className="filter-select-arrow">▼</span>
                </div>

                {/* Desktop Language Select, mirroring the Country control */}
                {availableLanguages.length > 0 && (
                  <div className="filter-select-wrap">
                    <select
                      className={`filter-select ${effectiveLanguage ? 'filter-select--active' : ''}`}
                      value={effectiveLanguage ?? ''}
                      onChange={(e) => setSelectedLanguage(e.target.value || null)}
                      aria-label="Filter by language"
                    >
                      <option value="">🌐 All Languages ({availableLanguages.length})</option>
                      {availableLanguages.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name} ({l.count})
                        </option>
                      ))}
                    </select>
                    <span className="filter-select-arrow">▼</span>
                  </div>
                )}
              </div>

              {/* Horizontally scrollable category track */}
              <div className="home-categories-scroll-wrap">
                <div className="home-categories-scroll" ref={categoriesScrollRef}>
                  {availableCategories.map((cat) => {
                    const isActive = selectedCategory === cat.id
                    const icon = CATEGORY_ICONS[cat.id.toLowerCase()] || '📺'
                    return (
                      <button
                        key={cat.id}
                        className={`filter-pill ${isActive ? 'filter-pill--active' : ''}`}
                        onClick={() => setSelectedCategory((v) => (v === cat.id ? null : cat.id))}
                        title={`${cat.name} (${cat.count} channels)`}
                      >
                        <span className="filter-pill__icon">{icon}</span>
                        <span>{cat.name}</span>
                        <span className="filter-pill__count">{cat.count}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Grid Mode: when any filter or search is active */}
          {isGridMode ? (
            <section className="home-search-results fade-up">
              <div className="home-search-results__title-bar">
                <h2 className="home-search-results__title">
                  {search.trim()
                    ? `"${search}" — ${activeGridChannels.length} channels`
                    : selectedCategory
                      ? `${categories.find((c) => c.id === selectedCategory)?.name ?? 'Category'} — ${activeGridChannels.length} channels`
                      : selectedCountry
                        ? `${formatCountryDisplay(selectedCountry)} — ${activeGridChannels.length} channels`
                        : `${activeGridChannels.length} channels`}
                </h2>
              </div>
              <div className="home-search-results__grid">
                {activeGridChannels.slice(0, gridLimit).map((ch) => (
                  <ChannelCard key={ch.id} channel={ch} playlist={activeGridPlaylist} onWatch={handleWatch} />
                ))}
              </div>

              {gridLimit < activeGridChannels.length && (
                <div className="home-load-more">
                  <button
                    className="home-load-more__btn"
                    onClick={() => setUserExpandedLimit((prev) => prev + GRID_BATCH_SIZE)}
                  >
                    Load More Channels ({activeGridChannels.length - gridLimit} remaining)
                  </button>
                </div>
              )}
            </section>
          ) : (
            /* Normal row mode */
            <>
              {/* Favourites row */}
              {favouriteChannels.length > 0 && (
                <CategoryRow title="♥ Favourites" channels={favouriteChannels} onWatch={handleWatch} />
              )}

              {/* Recently watched */}
              {recentChannels.length > 0 && (
                <CategoryRow title="▶ Continue Watching" channels={recentChannels} onWatch={handleWatch} />
              )}

              {/* Priority Category Rows */}
              {availableCategories.map((cat) => {
                const chans = channelsByCategory.get(cat.id) ?? []
                if (chans.length === 0) return null
                const icon = CATEGORY_ICONS[cat.id.toLowerCase()] || '📺'
                return (
                  <CategoryRow
                    key={cat.id}
                    title={`${icon} ${cat.name}`}
                    channels={chans}
                    onWatch={handleWatch}
                  />
                )
              })}
            </>
          )}

          {/* Mobile Filter Sheet Modal */}
          <FilterSheet
            isOpen={isFilterSheetOpen}
            onClose={() => setIsFilterSheetOpen(false)}
            totalChannelsCount={activeGridChannels.length}
            availableCountries={availableCountries}
            selectedCountry={effectiveCountry}
            onSelectCountry={setSelectedCountry}
            availableCategories={availableCategories}
            selectedCategory={effectiveCategory}
            onSelectCategory={setSelectedCategory}
            availableLanguages={availableLanguages}
            selectedLanguage={effectiveLanguage}
            onSelectLanguage={setSelectedLanguage}
            availableQualities={availableQualities}
            selectedQuality={effectiveQuality}
            onSelectQuality={setSelectedQuality}
            showFavOnly={showFavOnly}
            onToggleFavOnly={() => setShowFavOnly((v) => !v)}
            favCount={favouriteChannels.length}
            onClearAll={clearFilters}
            hasActiveFilters={hasActiveFilter}
          />
        </>
      )}
    </div>
  )
}
