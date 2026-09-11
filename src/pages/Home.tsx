import { useState, useMemo, useCallback } from 'react'
import { useChannels, useFavourites, useRecent } from '../hooks/useChannels'
import { HeroSection } from '../components/HeroSection'
import { CategoryRow } from '../components/CategoryRow'
import { SearchBar } from '../components/SearchBar'
import { ChannelCard } from '../components/ChannelCard'
import './Home.css'

export function Home() {
  const { channels, categories, loading, error, refresh } = useChannels()
  const { favouriteIds } = useFavourites()
  const { recentIds, addRecent } = useRecent()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [showFavOnly, setShowFavOnly] = useState(false)

  const playableChannels = useMemo(() => channels.filter((c) => c.stream), [channels])

  // Distinct countries (non-null, sorted)
  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const ch of playableChannels) if (ch.country) set.add(ch.country)
    return [...set].sort()
  }, [playableChannels])

  // Active filtered set (before search)
  const baseFiltered = useMemo(() => {
    let result = playableChannels
    if (showFavOnly) result = result.filter((ch) => favouriteIds.has(ch.id))
    if (selectedCountry) result = result.filter((ch) => ch.country === selectedCountry)
    if (selectedCategory) result = result.filter((ch) => ch.categoryIds.includes(selectedCategory))
    return result
  }, [playableChannels, showFavOnly, selectedCountry, selectedCategory, favouriteIds])

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return baseFiltered.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        (ch.country ?? '').toLowerCase().includes(q)
    )
  }, [search, baseFiltered])

  const categoryMap = useMemo(() => {
    const map = new Map<string, typeof playableChannels>()
    for (const cat of categories) {
      const chans = baseFiltered.filter((ch) => ch.categoryIds.includes(cat.id))
      if (chans.length >= 2) map.set(cat.id, chans)
    }
    return map
  }, [categories, baseFiltered])

  const orderedCategories = useMemo(() => (
    [...categories]
      .filter((cat) => categoryMap.has(cat.id))
      .sort((a, b) => (categoryMap.get(b.id)?.length ?? 0) - (categoryMap.get(a.id)?.length ?? 0))
  ), [categories, categoryMap])

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
    setShowFavOnly(false)
    setSearch('')
  }, [])

  const hasActiveFilter = selectedCategory || selectedCountry || showFavOnly || search

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
            <SearchBar value={search} onChange={setSearch} resultCount={searched?.length} />

            <div className="home-filters">
              {/* Favourites toggle */}
              <button
                className={`filter-pill ${showFavOnly ? 'filter-pill--active' : ''}`}
                onClick={() => { setShowFavOnly((v) => !v); setSelectedCategory(null); setSelectedCountry(null) }}
              >
                ♥ Favourites {favouriteChannels.length > 0 && `(${favouriteChannels.length})`}
              </button>

              {/* Country picker */}
              <select
                className="filter-select"
                value={selectedCountry ?? ''}
                onChange={(e) => setSelectedCountry(e.target.value || null)}
              >
                <option value="">🌍 Country</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>

              {/* Category pills */}
              {categories.slice(0, 8).map((cat) => (
                categoryMap.has(cat.id) && (
                  <button
                    key={cat.id}
                    className={`filter-pill ${selectedCategory === cat.id ? 'filter-pill--active' : ''}`}
                    onClick={() => setSelectedCategory((v) => v === cat.id ? null : cat.id)}
                  >
                    {cat.name}
                  </button>
                )
              ))}

              {/* Clear filters */}
              {hasActiveFilter && (
                <button className="filter-pill filter-pill--clear" onClick={clearFilters}>
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Search results overlay */}
          {searched !== null && (
            <section className="home-search-results fade-up">
              <h2 className="home-search-results__title">
                {searched.length > 0 ? `"${search}" — ${searched.length} channels` : `No results for "${search}"`}
              </h2>
              <div className="home-search-results__grid">
                {searched.map((ch) => (
                  <ChannelCard key={ch.id} channel={ch} onWatch={handleWatch} />
                ))}
              </div>
            </section>
          )}

          {searched === null && (
            <>
              {/* Favourites row */}
              {!showFavOnly && favouriteChannels.length > 0 && (
                <CategoryRow title="♥ Favourites" channels={favouriteChannels} onWatch={handleWatch} />
              )}

              {/* Recently watched */}
              {!showFavOnly && recentChannels.length > 0 && (
                <CategoryRow title="▶ Continue Watching" channels={recentChannels} onWatch={handleWatch} />
              )}

              {/* Filtered: single "All" row */}
              {(showFavOnly || selectedCountry || selectedCategory) ? (
                <section className="home-search-results fade-up">
                  <h2 className="home-search-results__title">
                    {baseFiltered.length} channels
                  </h2>
                  <div className="home-search-results__grid">
                    {baseFiltered.map((ch) => (
                      <ChannelCard key={ch.id} channel={ch} onWatch={handleWatch} />
                    ))}
                  </div>
                </section>
              ) : (
                /* Normal category rows */
                orderedCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    title={cat.name}
                    channels={categoryMap.get(cat.id) ?? []}
                    onWatch={handleWatch}
                  />
                ))
              )}

              {orderedCategories.length === 0 && !showFavOnly && !selectedCountry && !selectedCategory && (
                <CategoryRow title="All Channels" channels={playableChannels} onWatch={handleWatch} />
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
