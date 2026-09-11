import { useMemo, useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useChannels, useFavourites, useRecent } from '../hooks/useChannels'
import { ChannelCard } from '../components/ChannelCard'
import { SearchBar } from '../components/SearchBar'
import './Favorites.css'

export function Favorites() {
  const location = useLocation()
  const { channels, loading } = useChannels()
  const { favouriteIds } = useFavourites()
  const { addRecent } = useRecent()
  const [search, setSearch] = useState('')

  const playableChannels = useMemo(() => channels.filter((c) => c.stream), [channels])

  const favChannels = useMemo(
    () => playableChannels.filter((c) => favouriteIds.has(c.id)),
    [playableChannels, favouriteIds]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return favChannels
    return favChannels.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.country ?? '').toLowerCase().includes(q)
    )
  }, [favChannels, search])

  const filteredPlaylist = useMemo(() => filtered.map((c) => c.id), [filtered])

  // Restore focus and scroll into view when returning from player
  useEffect(() => {
    const targetId =
      (location.state as { targetChannelId?: string } | null)?.targetChannelId ||
      sessionStorage.getItem('sl_last_viewed')

    if (!targetId || filtered.length === 0) return

    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-channel-id="${targetId}"]`) as HTMLElement | null
      if (el) {
        el.focus({ preventScroll: false })
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [location.state, filtered.length])

  return (
    <div className="page-wrapper favorites-page">
      <div className="favorites-page__header">
        <h1 className="favorites-page__title">
          Favourites
          {!loading && (
            <span className="favorites-page__count">{favChannels.length} channels</span>
          )}
        </h1>
        <p className="favorites-page__subtitle">Your handpicked favourite live channels</p>
      </div>

      {favChannels.length > 0 && (
        <div className="favorites-page__toolbar">
          <SearchBar value={search} onChange={setSearch} resultCount={filtered.length} />
        </div>
      )}

      {loading ? (
        <div className="favorites-page__empty">
          <div className="guide-loader" />
          <p>Loading your favourites…</p>
        </div>
      ) : favChannels.length === 0 ? (
        <div className="favorites-page__empty glass">
          <div className="favorites-page__empty-icon">♥</div>
          <h2>No favourite channels yet</h2>
          <p>Click the heart icon on any channel card to save it here for quick access.</p>
          <Link to="/" className="favorites-page__cta-btn">
            Browse Channels
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="favorites-page__empty glass">
          <p>No favourite channels matched "{search}"</p>
        </div>
      ) : (
        <div className="favorites-page__grid">
          {filtered.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              playlist={filteredPlaylist}
              onWatch={(id) => addRecent(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
