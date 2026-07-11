import { useMemo, useState } from 'react'

// Input z podpowiedziami jako TAPOWALNE CHIPY pod polem (pojawiają się przy
// fokusie). Zastępuje dawne natywne <datalist>, które lagowało na iOS Safari
// (przebudowa listy przy każdym klawiszu). Chipy filtrują się do tego, co user
// już wpisał, i znikają po wyborze / utracie fokusu.
//
// `suggestions` — tablica stringów (policzona z historii przez utils/suggestions).
// Pozostałe propsy (value, onChange, type, className, placeholder…) → do <input>.
export default function SuggestInput({ suggestions = [], className = '', value = '', onChange, ...inputProps }) {
  const [focused, setFocused] = useState(false)

  const matches = useMemo(() => {
    const v = (value || '').trim().toLowerCase()
    const list = (suggestions || []).filter((s) => s && typeof s === 'string')
    const filtered = v
      ? list.filter((s) => s.toLowerCase().includes(v) && s.toLowerCase() !== v)
      : list
    return filtered.slice(0, 6)
  }, [suggestions, value])

  const pick = (s) => {
    onChange?.({ target: { value: s } })
    setFocused(false)
  }

  return (
    <div className="relative">
      <input
        {...inputProps}
        value={value}
        onChange={onChange}
        className={className}
        onFocus={() => setFocused(true)}
        // Opóźnienie pozwala klikowi w chip wystrzelić przed zamknięciem (blur).
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && matches.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              // preventDefault na mousedown → input nie traci fokusu przed onClick
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              className="text-xs px-2.5 py-1 rounded-full bg-sure-blue/10 text-sure-blue border border-sure-blue/20 hover:bg-sure-blue/20 dark:bg-sure-blue/20 dark:text-sky-200 dark:border-sure-blue/30 max-w-full truncate"
              title={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
