import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import { useFavourites } from '../hooks/useChannels'
import './ChannelCard.css'

interface Props {
  channel: EnrichedChannel
  nowPlaying?: EpgProgram | null
  size?: 'small' | 'medium' | 'large'
  onWatch?: (channelId: string) => void
}

export function ChannelCard({ channel, nowPlaying, size = 'medium', onWatch }: Props) {
  const navigate = useNavigate()
  const { isFavourite, toggle } = useFavourites()
  const hasStream = !!channel.stream
  const fav = isFavourite(channel.id)

  const handleClick = useCallback(() => {
    if (!hasStream) return
    onWatch?.(channel.id)
    navigate(`/watch/${encodeURIComponent(channel.id)}`)
  }, [hasStream, channel.id, navigate, onWatch])

  const handleFav = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    toggle(channel.id)
  }, [channel.id, toggle])

  return (
    <article
      className={`channel-card channel-card--${size} ${!hasStream ? 'channel-card--no-stream' : ''}`}
      onClick={handleClick}
      role={hasStream ? 'button' : undefined}
      tabIndex={hasStream ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      aria-label={`Play ${channel.name}`}
    >
      <div className="channel-card__thumb">
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            loading="lazy"
            decoding="async"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <span className="channel-card__initials">
            {channel.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        {hasStream && <div className="channel-card__play-overlay">▶</div>}

        {/* Quality badge */}
        {channel.stream?.quality && channel.stream.quality !== '' && (
          <span className="channel-card__quality">{channel.stream.quality.toUpperCase()}</span>
        )}

        {/* Favourite button */}
        <button
          className={`channel-card__fav ${fav ? 'channel-card__fav--active' : ''}`}
          onClick={handleFav}
          aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
          title={fav ? 'Remove favourite' : 'Add to favourites'}
        >
          {fav ? '♥' : '♡'}
        </button>
      </div>

      <div className="channel-card__info">
        <p className="channel-card__name">{channel.name}</p>
        {nowPlaying ? (
          <p className="channel-card__epg" title={nowPlaying.title}>
            <span className="live-dot" style={{ marginRight: 6 }} />
            {nowPlaying.title}
          </p>
        ) : channel.country ? (
          <p className="channel-card__country">{channel.country.toUpperCase()}</p>
        ) : null}
      </div>
    </article>
  )
}
