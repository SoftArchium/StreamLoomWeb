import { useEffect, useRef } from 'react'
import './SearchBar.css'

interface Props {
  value: string
  onChange: (v: string) => void
  resultCount?: number
}

export function SearchBar({ value, onChange, resultCount }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Press "/" to focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      } else if (e.key === 'Escape') {
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur()
          onChange('')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onChange])

  return (
    <div className="search-bar glass">
      <span className="search-bar__icon">⌕</span>
      <input
        ref={inputRef}
        id="channel-search"
        className="search-bar__input"
        type="search"
        placeholder="Search channels…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-label="Search channels"
      />
      {value && resultCount !== undefined && (
        <span className="search-bar__count">{resultCount} found</span>
      )}
      <kbd className="search-bar__shortcut">/</kbd>
    </div>
  )
}
