import { useRef, useState, useCallback, useEffect } from 'react'
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

const INITIAL_CHUNK = 24
const CHUNK_SIZE = 24

export function CategoryRow({ title, channels, nowPlayingMap, onWatch }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_CHUNK)

  // Expand visible channels when needed
  const ensureMoreVisible = useCallback(() => {
    setVisibleCount((prev) => (prev < channels.length ? Math.min(prev + CHUNK_SIZE, channels.length) : prev))
  }, [channels.length])

  function scroll(dir: 'left' | 'right') {
    if (dir === 'right') {
      ensureMoreVisible()
    }
    rowRef.current?.scrollBy({ left: dir === 'right' ? 560 : -560, behavior: 'smooth' })
  }

  // Mouse wheel horizontal translation on desktop
  useEffect(() => {
    const el = rowRef.current
    if (!el) return

    function handleWheel(e: WheelEvent) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 5) {
        // Translate vertical wheel scroll to horizontal track scroll
        e.preventDefault()
        el?.scrollBy({ left: e.deltaY * 1.8, behavior: 'auto' })
        if (el && el.scrollLeft + el.clientWidth >= el.scrollWidth - 300) {
          ensureMoreVisible()
        }
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [ensureMoreVisible])

  // Track scroll listener to load more as user swipes/scrolls horizontally
  const handleScroll = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 400) {
      ensureMoreVisible()
    }
  }, [ensureMoreVisible])

  if (channels.length === 0) return null

  const renderedChannels = channels.slice(0, visibleCount)

  return (
    <section className="category-row fade-up">
      <div className="category-row__header">
        <div className="category-row__title-wrap">
          <h2 className="category-row__title">{title}</h2>
          <span className="category-row__count">{channels.length}</span>
        </div>
        <div className="category-row__controls">
          <button className="category-row__arrow" onClick={() => scroll('left')} aria-label="Scroll left">‹</button>
          <button className="category-row__arrow" onClick={() => scroll('right')} aria-label="Scroll right">›</button>
        </div>
      </div>
      <div
        className="category-row__track"
        ref={rowRef}
        onScroll={handleScroll}
        tabIndex={-1}
      >
        {renderedChannels.map((ch) => (
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
