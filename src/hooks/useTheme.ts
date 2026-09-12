import { useState, useEffect, useCallback } from 'react'
import { getStoredTheme, setTheme as setGlobalTheme, toggleTheme as toggleGlobalTheme, onThemeChange, type Theme } from '../util/theme'

export function useTheme() {
  const [theme, setLocalTheme] = useState<Theme>(() => getStoredTheme())

  useEffect(() => {
    return onThemeChange((next) => {
      setLocalTheme(next)
    })
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setGlobalTheme(next)
  }, [])

  const toggleTheme = useCallback(() => {
    return toggleGlobalTheme()
  }, [])

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  }
}
