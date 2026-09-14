import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLanguageName } from '../util/language'
import './LanguageFilter.css'

export interface LanguageOption {
  code: string
  name: string
  count: number
}

interface Props {
  availableLanguages: LanguageOption[]
  selectedLanguage: string | null
  onSelectLanguage: (code: string | null) => void
}

export function LanguageFilter({ availableLanguages, selectedLanguage, onSelectLanguage }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  /*
   * Closing resets the search. Kept in the handler rather than an effect so we
   * are not starting a second render just to clear a field.
   */
  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
  }, [])
  useEffect(() => {
    if (!isOpen) return

    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, close])

  const visibleLanguages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return availableLanguages
    return availableLanguages.filter(
      (lang) => lang.name.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q),
    )
  }, [availableLanguages, query])

  // Nothing to filter on until the sync worker publishes languages.
  if (availableLanguages.length === 0) return null

  const activeName = selectedLanguage ? getLanguageName(selectedLanguage) : 'Language'
  const triggerClass =
    `filter-pill lang-filter__trigger` + (selectedLanguage ? ' filter-pill--active' : '') + ` `

  return (
    <div className="lang-filter" ref={rootRef}>
      <button
        type="button"
        className={triggerClass}
        onClick={() =>
          setIsOpen((v) => {
            if (v) setQuery('')
            return !v
          })
        }
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span aria-hidden="true">🌐</span>
        <span>{activeName}</span>
        <span className="lang-filter__chevron" aria-hidden="true">
          ›
        </span>
      </button>

      {isOpen && (
        <div className="lang-filter__popover" role="listbox">
          <div className="lang-filter__header">
            <span className="lang-filter__title">Language</span>
            {selectedLanguage && (
              <button
                type="button"
                className="lang-filter__clear"
                onClick={() => {
                  onSelectLanguage(null)
                  close()
                }}
              >
                Clear
              </button>
            )}
          </div>

          <input
            type="search"
            className="lang-filter__search"
            placeholder="Search languages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          <div className="lang-filter__list">
            <button
              type="button"
              className={`lang-filter__row` + (selectedLanguage ? '' : ' lang-filter__row--active')}
              onClick={() => {
                onSelectLanguage(null)
                close()
              }}
            >
              <span className="lang-filter__name">All languages</span>
              {!selectedLanguage && <span className="lang-filter__tick">✓</span>}
            </button>

            {visibleLanguages.map((lang) => {
              const isActive = selectedLanguage === lang.code
              return (
                <button
                  type="button"
                  key={lang.code}
                  className={`lang-filter__row` + (isActive ? ' lang-filter__row--active' : '')}
                  onClick={() => {
                    onSelectLanguage(isActive ? null : lang.code)
                    close()
                  }}
                >
                  <span className="lang-filter__name">{lang.name}</span>
                  <span className="lang-filter__count">{lang.count}</span>
                  {isActive && <span className="lang-filter__tick">✓</span>}
                </button>
              )
            })}

            {visibleLanguages.length === 0 && <p className="lang-filter__empty">No languages match</p>}
          </div>
        </div>
      )}
    </div>
  )
}
