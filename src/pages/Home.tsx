import { useState, useMemo } from 'react'
import { useChannels } from '../hooks/useChannels'
import { HeroSection } from '../components/HeroSection'
import { CategoryRow } from '../components/CategoryRow'
import { SearchBar } from '../components/SearchBar'
import { ChannelCard } from '../components/ChannelCard'
import './Home.css'

export function Home() {
  const { channels, categories, loading, error } = useChannels()
  const [search, setSearch] = useState('')

  const playableChannels = useMemo(() => channels.filter((c) => c.stream), [channels])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return playableChannels.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        (ch.country ?? '').toLowerCase().includes(q)
    )
  }, [search, playableChannels])

  const categoryMap = useMemo(() => {
    const map = new Map<string, typeof playableChannels>()
    for (const cat of categories) {
      const chans = playableChannels.filter((ch) => ch.categoryIds.includes(cat.id))
      if (chans.length >= 3) map.set(cat.id, chans)
    }
    return map
  }, [categories, playableChannels])

  const orderedCategories = useMemo(() => {
    // Sort categories by channel count descending so the most-populated rows are first
    return [...categories]
      .filter((cat) => categoryMap.has(cat.id))
      .sort((a, b) => (categoryMap.get(b.id)?.length ?? 0) - (categoryMap.get(a.id)?.length ?? 0))
  }, [categories, categoryMap])

  if (error) {
    return (
      <div className="home-error">
        <p>⚠️ {error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    )
  }

  return (
    <div className="page-wrapper home-page">
      {loading ? (
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
          <HeroSection channels={playableChannels} />

          <div className="home-toolbar">
            <SearchBar
              value={search}
              onChange={setSearch}
              resultCount={search ? filtered.length : undefined}
            />
          </div>

          {/* Search results */}
          {search && (
            <section className="home-search-results fade-up">
              <h2 className="home-search-results__title">
                {filtered.length > 0 ? `Results for "${search}"` : `No results for "${search}"`}
              </h2>
              <div className="home-search-results__grid">
                {filtered.map((ch) => (
                  <ChannelCard key={ch.id} channel={ch} />
                ))}
              </div>
            </section>
          )}

          {/* Category rows */}
          {!search && orderedCategories.map((cat) => (
            <CategoryRow
              key={cat.id}
              title={cat.name}
              channels={categoryMap.get(cat.id) ?? []}
            />
          ))}

          {/* All channels fallback if no categories */}
          {!search && orderedCategories.length === 0 && (
            <CategoryRow title="All Channels" channels={playableChannels} />
          )}
        </>
      )}
    </div>
  )
}
