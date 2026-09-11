import { useNavigate } from 'react-router-dom'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import './ChannelCard.css'

interface Props {
  channel: EnrichedChannel
  nowPlaying?: EpgProgram | null
  size?: 'small' | 'medium' | 'large'
}

export function ChannelCard({ channel, nowPlaying, size = 'medium' }: Props) {
  const navigate = useNavigate()
  const hasStream = !!channel.stream

  function handleClick() {
    if (hasStream) navigate(`/watch/${encodeURIComponent(channel.id)}`)
  }

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
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <span className="channel-card__initials">
            {channel.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        {hasStream && <div className="channel-card__play-overlay">▶</div>}
      </div>

      <div className="channel-card__info">
        <p className="channel-card__name">{channel.name}</p>
        {nowPlaying && (
          <p className="channel-card__epg" title={nowPlaying.title}>
            <span className="live-dot" style={{ marginRight: 6 }} />
            {nowPlaying.title}
          </p>
        )}
      </div>
    </article>
  )
}
