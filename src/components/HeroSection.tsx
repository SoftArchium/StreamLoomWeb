import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EnrichedChannel } from '../hooks/useChannels'
import './HeroSection.css'

interface Props {
  channels: EnrichedChannel[]
}

const CYCLE_INTERVAL = 8000

export function HeroSection({ channels }: Props) {
  const [idx, setIdx] = useState(0)
  const navigate = useNavigate()

  // Pick up to 8 channels with logos for the hero
  const heroChannels = channels.filter((ch) => ch.logo && ch.stream).slice(0, 8)

  useEffect(() => {
    if (heroChannels.length <= 1) return
    const id = setInterval(() => setIdx((i) => (i + 1) % heroChannels.length), CYCLE_INTERVAL)
    return () => clearInterval(id)
  }, [heroChannels.length])

  if (heroChannels.length === 0) return null

  const featured = heroChannels[idx]

  return (
    <section className="hero noise">
      {/* Background blur gradient from logo colour */}
      <div
        className="hero__bg"
        style={{ '--hero-bg': `url(${featured.logo})` } as React.CSSProperties}
      />
      <div className="hero__overlay" />

      <div className="hero__content fade-up" key={featured.id}>
        <div className="hero__logo-wrap">
          {featured.logo && <img src={featured.logo} alt={featured.name} className="hero__logo" />}
        </div>
        <h1 className="hero__name">{featured.name}</h1>
        {featured.country && (
          <p className="hero__meta">
            <span className="hero__badge">{featured.country.toUpperCase()}</span>
          </p>
        )}
        <div className="hero__actions">
          <button
            className="hero__btn hero__btn--primary"
            onClick={() => {
              sessionStorage.setItem('sl_last_viewed', featured.id)
              navigate(`/watch/${encodeURIComponent(featured.id)}`, {
                state: {
                  playlist: heroChannels.map((c) => c.id),
                  returnTo: '/',
                },
              })
            }}
          >
            ▶ Watch Now
          </button>
          <button
            className="hero__btn hero__btn--secondary"
            onClick={() => navigate('/guide')}
          >
            ≡ TV Guide
          </button>
        </div>
      </div>

      {/* Dots indicator */}
      <div className="hero__dots">
        {heroChannels.map((_, i) => (
          <button
            key={i}
            className={`hero__dot ${i === idx ? 'hero__dot--active' : ''}`}
            onClick={() => setIdx(i)}
            aria-label={`Show channel ${i + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
