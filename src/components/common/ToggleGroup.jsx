// Unified toggle-button group used wherever spec asks for `[Opcja A] [Opcja B] [...]` toggles.
// Replaces the ad-hoc `min-w-[NNN]` toggle buttons sprinkled across the report components.
export default function ToggleGroup({ items, value, onChange, size = 'md' }) {
  const sizeCls = size === 'sm'
    ? 'px-3 py-2 text-sm min-h-[40px] min-w-[110px]'
    : 'px-4 py-3 text-sm min-h-[44px] min-w-[140px]'

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = value === it.key
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={
              'flex-1 rounded-lg border-2 font-medium transition select-none active:scale-[0.98] ' +
              'focus:outline-none focus:ring-2 focus:ring-sure-blue/40 ' +
              sizeCls + ' ' +
              (active
                ? (it.activeClass || 'bg-sure-blue text-white border-transparent')
                : (it.inactiveClass || 'bg-white text-gray-600 border-gray-200 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500'))
            }
          >
            {it.icon ? <span className="mr-1.5">{it.icon}</span> : null}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
