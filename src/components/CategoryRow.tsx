import { useRef } from 'react'
import { ChannelCard } from './ChannelCard'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/supabase'
import './CategoryRow.css'

interface Props {
  title: string
  channels: EnrichedChannel[]
  nowPlayingMap?: Map<string, EpgProgram>
  onWatch?: (channelId: string) => void
}

export function CategoryRow({ title, channels, nowPlayingMap, onWatch }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)

  function scroll(dir: 'left' | 'right') {
    rowRef.current?.scrollBy({ left: dir === 'right' ? 560 : -560, behavior: 'smooth' })
  }

  if (channels.length === 0) return null

  return (
    <section className="category-row fade-up">
      <div className="category-row__header">
        <h2 className="category-row__title">{title}</h2>
        <div className="category-row__controls">
          <button className="category-row__arrow" onClick={() => scroll('left')} aria-label="Scroll left">‹</button>
          <button className="category-row__arrow" onClick={() => scroll('right')} aria-label="Scroll right">›</button>
        </div>
      </div>
      <div className="category-row__track" ref={rowRef}>
        {channels.map((ch) => (
          <ChannelCard
            key={ch.id}
            channel={ch}
            nowPlaying={nowPlayingMap?.get(ch.id)}
            onWatch={onWatch}
          />
        ))}
      </div>
    </section>
  )
}
