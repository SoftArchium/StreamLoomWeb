import { useRef, useState, useCallback, useEffect } from 'react'
import { ChannelCard } from './ChannelCard'
import type { EnrichedChannel } from '../hooks/useChannels'
import type { EpgProgram } from '../api/types'
import './CategoryRow.css'

interface Props {
  title: string
  channels: EnrichedChannel[]
  nowPlayingMap?: Map<string, EpgProgram>
  onWatch?: (channelId: string) => void
}

const INITIAL_CHUNK = 24
const CHUNK_SIZE = 24

/** How far ahead of the viewport a row starts mounting its cards. */
const REVEAL_ROOT_MARGIN = '600px 0px'

export function CategoryRow({ title, channels, nowPlayingMap, onWatch }: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_CHUNK)
  const [isRevealed, setIsRevealed] = useState(false)

  /*
   * Mounting every card up front cost rows x 24 image nodes before the first
   * paint. A row now mounts its cards only as it approaches the viewport; the
   * placeholders reuse the real card markup so the height, and therefore the
   * scroll position, stays put when the cards swap in.
   */
  useEffect(() => {
    if (isRevealed) return
    const el = sectionRef.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      Promise.resolve().then(() => setIsRevealed(true))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsRevealed(true)
          observer.disconnect()
        }
      },
      { rootMargin: REVEAL_ROOT_MARGIN }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isRevealed])

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
  const ghostCount = Math.min(INITIAL_CHUNK, channels.length)

  return (
    <section className="category-row fade-up" ref={sectionRef}>
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
        {isRevealed
          ? renderedChannels.map((ch) => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                nowPlaying={nowPlayingMap?.get(ch.id)}
                onWatch={onWatch}
                playlist={channels.map((c) => c.id)}
              />
            ))
          : Array.from({ length: ghostCount }, (_, i) => (
              <div
                key={i}
                className="channel-card channel-card--medium channel-card--ghost"
                aria-hidden="true"
              >
                <div className="channel-card__thumb" />
                <div className="channel-card__info">
                  <span className="skeleton channel-card__ghost-line" style={{ width: '80%' }} />
                  <span className="skeleton channel-card__ghost-line" style={{ width: '50%' }} />
                </div>
              </div>
            ))}
      </div>
    </section>
  )
}
