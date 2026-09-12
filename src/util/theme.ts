/**
 * Theme utility for managing Dark and Light appearance modes.
 * Defaults to 'dark' with persistence in localStorage ('sl_theme').
 */

export type Theme = 'dark' | 'light'

const THEME_KEY = 'sl_theme'
const listeners = new Set<(theme: Theme) => void>()

export function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') {
      return saved
    }
  } catch {
    // ignore
  }
  return 'dark'
}

export function applyThemeToDom(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.classList.toggle('light-theme', theme === 'light')
  document.documentElement.classList.toggle('dark-theme', theme === 'dark')

  const metaTheme = document.querySelector('meta[name="theme-color"]')
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'light' ? '#f4f4f7' : '#0a0a0f')
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // ignore
  }
  applyThemeToDom(theme)
  listeners.forEach((fn) => {
    try {
      fn(theme)
    } catch {
      // ignore
    }
  })
}

export function toggleTheme(): Theme {
  const next = getStoredTheme() === 'light' ? 'dark' : 'light'
  setTheme(next)
  return next
}

export function onThemeChange(listener: (theme: Theme) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Initial application
if (typeof window !== 'undefined') {
  applyThemeToDom(getStoredTheme())
}
