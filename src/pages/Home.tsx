import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useChannels, useFavourites, useRecent } from '../hooks/useChannels'
import type { EnrichedChannel } from '../hooks/useChannels'
import { HeroSection } from '../components/HeroSection'
import { CategoryRow } from '../components/CategoryRow'
import { SearchBar } from '../components/SearchBar'
import { ChannelCard } from '../components/ChannelCard'
import { useKeyboardNav } from '../hooks/useKeyboardNav'
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

const RESOLUTIONS = ['All Quality', '4K', 'FHD (1080p)', 'HD (720p)', 'SD']

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
  const { channels, categories, loading, error, refresh } = useChannels()
  const { favouriteIds } = useFavourites()
  const { recentIds, addRecent } = useRecent()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [selectedQuality, setSelectedQuality] = useState<string>('All Quality')
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [gridLimit, setGridLimit] = useState(GRID_BATCH_SIZE)

  const categoriesScrollRef = useRef<HTMLDivElement>(null)

  const playableChannels = useMemo(() => channels.filter((c) => c.stream), [channels])

  // Pre-index channels by category once for O(1) lookups
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

  // Prioritized category list (Music, Movies, Cartoons, Comedy, News, Sports first)
  const sortedCategories = useMemo(() => {
    const available = categories.filter((c) => (channelsByCategory.get(c.id)?.length ?? 0) > 0)
    return available.sort((a, b) => {
      const aIndex = PRIORITY_CATEGORIES.indexOf(a.id.toLowerCase())
      const bIndex = PRIORITY_CATEGORIES.indexOf(b.id.toLowerCase())
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
      if (aIndex !== -1) return -1
      if (bIndex !== -1) return 1
      return a.name.localeCompare(b.name)
    })
  }, [categories, channelsByCategory])

  // Distinct countries (non-null, sorted)
  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const ch of playableChannels) if (ch.country) set.add(ch.country)
    return [...set].sort()
  }, [playableChannels])

  // Active filtered set
  const baseFiltered = useMemo(() => {
    let result = playableChannels
    if (showFavOnly) result = result.filter((ch) => favouriteIds.has(ch.id))
    if (selectedCountry) result = result.filter((ch) => ch.country === selectedCountry)
    if (selectedCategory) result = result.filter((ch) => ch.categoryIds.includes(selectedCategory))
    if (selectedQuality !== 'All Quality') {
      result = result.filter((ch) => matchQuality(ch.stream?.quality, selectedQuality))
    }
    return result
  }, [playableChannels, showFavOnly, selectedCountry, selectedCategory, selectedQuality, favouriteIds])

  // Search filtered set
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return baseFiltered.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        (ch.country ?? '').toLowerCase().includes(q)
    )
  }, [search, baseFiltered])

  const favouriteChannels = useMemo(
    () => playableChannels.filter((ch) => favouriteIds.has(ch.id)),
    [playableChannels, favouriteIds]
  )

  const recentChannels = useMemo(
    () =>
      recentIds
        .map((id) => playableChannels.find((ch) => ch.id === id))
        .filter(Boolean) as typeof playableChannels,
    [recentIds, playableChannels]
  )

  const handleWatch = useCallback((channelId: string) => addRecent(channelId), [addRecent])

  const clearFilters = useCallback(() => {
    setSelectedCategory(null)
    setSelectedCountry(null)
    setSelectedQuality('All Quality')
    setShowFavOnly(false)
    setSearch('')
    setGridLimit(GRID_BATCH_SIZE)
  }, [])

  // Reset grid limit when filters change without triggering effect cascade
  const filterKey = `${selectedCategory}-${selectedCountry}-${selectedQuality}-${showFavOnly}-${search}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setGridLimit(GRID_BATCH_SIZE)
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
    Boolean(selectedCategory) ||
    Boolean(selectedCountry) ||
    selectedQuality !== 'All Quality' ||
    showFavOnly ||
    Boolean(search)

  if (error) {
    return (
      <div className="home-error">
        <p>⚠️ {error}</p>
        <button onClick={refresh}>Retry</button>
      </div>
    )
  }

  const activeGridChannels = searched !== null ? searched : baseFiltered
  const isGridMode = hasActiveFilter || searched !== null

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
            <SearchBar value={search} onChange={setSearch} resultCount={searched?.length} />

            <div className="home-filters-row">
              {/* Quick toggles */}
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

                {/* Quality / Resolution select */}
                <div className="filter-select-wrap">
                  <select
                    className={`filter-select ${selectedQuality !== 'All Quality' ? 'filter-select--active' : ''}`}
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                  >
                    {RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>📺 {r}</option>
                    ))}
                  </select>
                  <span className="filter-select-arrow">▼</span>
                </div>

                {/* Country picker */}
                <div className="filter-select-wrap">
                  <select
                    className={`filter-select ${selectedCountry ? 'filter-select--active' : ''}`}
                    value={selectedCountry ?? ''}
                    onChange={(e) => setSelectedCountry(e.target.value || null)}
                  >
                    <option value="">🌍 All Countries</option>
                    {countries.map((c) => (
                      <option key={c} value={c}>{c.toUpperCase()}</option>
                    ))}
                  </select>
                  <span className="filter-select-arrow">▼</span>
                </div>

                {/* Clear filters */}
                {hasActiveFilter && (
                  <button className="filter-pill filter-pill--clear" onClick={clearFilters} title="Reset all filters">
                    ✕ Clear
                  </button>
                )}
              </div>

              {/* Horizontally scrollable category track */}
              <div className="home-categories-scroll" ref={categoriesScrollRef}>
                {sortedCategories.map((cat) => {
                  const count = channelsByCategory.get(cat.id)?.length ?? 0
                  const isActive = selectedCategory === cat.id
                  const icon = CATEGORY_ICONS[cat.id.toLowerCase()] || '📺'
                  return (
                    <button
                      key={cat.id}
                      className={`filter-pill ${isActive ? 'filter-pill--active' : ''}`}
                      onClick={() => setSelectedCategory((v) => (v === cat.id ? null : cat.id))}
                      title={`${cat.name} (${count} channels)`}
                    >
                      <span className="filter-pill__icon">{icon}</span>
                      <span>{cat.name}</span>
                      <span className="filter-pill__count">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Grid Mode: when any filter or search is active */}
          {isGridMode ? (
            <section className="home-search-results fade-up">
              <div className="home-search-results__title-bar">
                <h2 className="home-search-results__title">
                  {searched !== null
                    ? `"${search}" — ${searched.length} channels`
                    : selectedCategory
                    ? `${categories.find((c) => c.id === selectedCategory)?.name ?? 'Category'} — ${activeGridChannels.length} channels`
                    : `${activeGridChannels.length} channels`}
                </h2>
              </div>
              <div className="home-search-results__grid">
                {activeGridChannels.slice(0, gridLimit).map((ch) => (
                  <ChannelCard key={ch.id} channel={ch} onWatch={handleWatch} />
                ))}
              </div>

              {gridLimit < activeGridChannels.length && (
                <div className="home-load-more">
                  <button
                    className="home-load-more__btn"
                    onClick={() => setGridLimit((prev) => prev + GRID_BATCH_SIZE)}
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
              {sortedCategories.map((cat) => {
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
        </>
      )}
    </div>
  )
}
