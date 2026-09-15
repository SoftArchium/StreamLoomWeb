import { useEffect, useMemo, useRef, useState } from 'react'
import type { EnrichedChannel } from '../api/types'
import { formatCountryDisplay } from '../util/country'
import { getLanguageName } from '../util/language'
import {
  activeFilterCount,
  facetCounts,
  hasActiveFilters,
} from '../util/epgFilter'
import type { GuideFilters } from '../util/epgFilter'

interface Props {
  filters: GuideFilters
  channels: EnrichedChannel[]
  epgChannelIds: Set<string>
  resultCount: number
  translate: boolean
  onToggleTranslate: () => void
  onScrollToNow: () => void
}

/**
 * Search + facet bar for the TV guide.
 *
 * Counts come from `facetCounts`, which evaluates each facet against all *other*
 * active filters, so a dropdown never collapses to its own selection.
 */
export function EpgToolbar({
  filters,
  channels,
  epgChannelIds,
  resultCount,
  translate,
  onToggleTranslate,
  onScrollToNow,
}: Props) {
  const scope = useMemo(
    () => channels.filter((ch) => epgChannelIds.has(ch.id) && ch.stream),
    [channels, epgChannelIds],
  )
  const [open, setOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" focuses search, Escape clears it — same affordance as the Home search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur()
        filters.onSearch('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filters])

  const countries = useMemo(() => {
    const counts = facetCounts(scope, filters, 'country')
    return [...counts.keys()]
      .map((code) => ({ code, count: counts.get(code) ?? 0, label: formatCountryDisplay(code) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [scope, filters])

  const languages = useMemo(() => {
    const counts = facetCounts(scope, filters, 'language')
    return [...counts.keys()]
      .map((code) => ({ code, count: counts.get(code) ?? 0, label: getLanguageName(code) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [scope, filters])

  const count = activeFilterCount(filters)
  const isFiltered = hasActiveFilters(filters)

  return (
    <div className="epg-toolbar">
      <div className="epg-toolbar__row">
        <div className="epg-toolbar__search">
          <span className="epg-toolbar__search-icon" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            type="search"
            className="epg-toolbar__search-input"
            placeholder="Search channels…"
            value={filters.search}
            onChange={(e) => filters.onSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search guide channels"
          />
          {filters.search && (
            <button
              type="button"
              className="epg-toolbar__clear"
              onClick={() => filters.onSearch('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
          <kbd className="epg-toolbar__kbd">/</kbd>
        </div>

        <button
          type="button"
          className={`epg-toolbar__btn${open ? ' epg-toolbar__btn--active' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span aria-hidden="true">☰</span>
          Filters
          {count > 0 && <span className="epg-toolbar__badge">{count}</span>}
        </button>

        <button
          type="button"
          className={`epg-toolbar__btn${translate ? ' epg-toolbar__btn--active' : ''}`}
          onClick={onToggleTranslate}
          aria-pressed={translate}
          title="Translate programme titles to English"
        >
          <span aria-hidden="true">🌐</span>
          {translate ? 'English' : 'Original'}
        </button>

        <button type="button" className="epg-toolbar__btn" onClick={onScrollToNow}>
          <span aria-hidden="true">◉</span>
          Now
        </button>

        <span className="epg-toolbar__count">
          {resultCount.toLocaleString()} {resultCount === 1 ? 'channel' : 'channels'}
        </span>
      </div>

      <div className={`epg-toolbar__facets${open ? ' epg-toolbar__facets--open' : ''}`}>
        <FacetSelect
          label="Country"
          value={filters.country}
          emptyLabel={`All countries (${countries.length})`}
          options={countries.map((c) => ({ value: c.code, label: `${c.label} (${c.count})` }))}
          onChange={filters.onCountry}
        />
        <FacetSelect
          label="Language"
          value={filters.language}
          emptyLabel={`All languages (${languages.length})`}
          options={languages.map((l) => ({ value: l.code, label: `${l.label} (${l.count})` }))}
          onChange={filters.onLanguage}
        />
        <FacetSelect
          label="Quality"
          value={filters.quality === 'All Quality' ? null : filters.quality}
          emptyLabel="All quality"
          options={['4K', 'FHD (1080p)', 'HD (720p)', 'SD'].map((q) => ({ value: q, label: q }))}
          onChange={(v) => filters.onQuality(v ?? 'All Quality')}
        />
        <button
          type="button"
          className={`epg-toolbar__chip${filters.favOnly ? ' epg-toolbar__chip--active' : ''}`}
          onClick={filters.onToggleFav}
          aria-pressed={filters.favOnly}
        >
          ♥ Favourites{filters.favouriteIds.size > 0 ? ` (${filters.favouriteIds.size})` : ''}
        </button>
        {isFiltered && (
          <button type="button" className="epg-toolbar__reset" onClick={filters.onClear}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

interface FacetProps {
  label: string
  value: string | null
  emptyLabel: string
  options: { value: string; label: string }[]
  onChange: (value: string | null) => void
}

/** Native select, so mobile and smart-TV browsers get their own pickers. */
function FacetSelect({ label, value, emptyLabel, options, onChange }: FacetProps) {
  return (
    <label className="epg-toolbar__select-wrap">
      <span className="visually-hidden">{label}</span>
      <select
        className={`epg-toolbar__select${value ? ' epg-toolbar__select--active' : ''}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="epg-toolbar__select-arrow" aria-hidden="true">▾</span>
    </label>
  )
}

