import { useEffect, useRef, useState } from 'react'

// Small "💾 Zapisano · 14:32" indicator that flashes for ~1.5s after each save,
// then settles into a quieter "Zapisano o 14:32" tag.
//
// `unsaved` = świeży, pusty szkic, którego jeszcze NIE ma w bazie (v1.2).
// Mówimy to wprost, bo brak jakiejkolwiek informacji zostawiał wątpliwość,
// czy raport już gdzieś wisi.
export default function AutoSaveIndicator({ savedAt, unsaved = false }) {
  const [highlight, setHighlight] = useState(false)
  const firstRef = useRef(true)

  useEffect(() => {
    if (!savedAt) return
    if (firstRef.current) { firstRef.current = false; return }
    setHighlight(true)
    const t = setTimeout(() => setHighlight(false), 1500)
    return () => clearTimeout(t)
  }, [savedAt])

  if (!savedAt) {
    if (!unsaved) return null
    return (
      <span
        className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap"
        title="Raport zapisze się w bazie po pierwszym wpisie — wyjście teraz nie zostawi po sobie śladu"
      >
        Szkic — nie zapisany
      </span>
    )
  }

  const d = new Date(savedAt)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  return (
    <span className={
      'text-xs transition-colors ' +
      (highlight ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-gray-400 dark:text-gray-500')
    }>
      💾 Zapisano {highlight ? '' : `o ${time}`}
    </span>
  )
}
