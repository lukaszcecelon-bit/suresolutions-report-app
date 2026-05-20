import { createContext, useContext, useEffect, useState } from 'react'

// Persist user's choice across sessions. First visit defaults to the system
// `prefers-color-scheme`. The inline script in index.html applies the .dark class
// *before* React hydrates so there's no white-flash for dark-mode users.
const STORAGE_KEY = 'suresolutions.theme'

const ThemeCtx = createContext(null)

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem(STORAGE_KEY, theme) } catch {}

    // Update PWA theme-color meta tag — affects iOS status bar tint and Android
    // chrome bar when the app is installed.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F172A' : '#3D70B2')
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeCtx.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

// Sun/moon toggle that shows the CURRENT theme (sun in light, moon in dark) —
// click to switch. Styled to fit alongside VersionBadge in the header.
export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
      aria-label={isDark ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
      className="text-xs text-gray-500 dark:text-gray-300 hover:text-sure-blue hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1.5 rounded transition flex items-center"
    >
      <span className="text-base leading-none">{isDark ? '🌙' : '☀️'}</span>
    </button>
  )
}
