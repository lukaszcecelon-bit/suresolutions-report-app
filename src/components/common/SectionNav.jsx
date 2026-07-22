import { useEffect, useMemo, useState } from 'react'
import { validateReport } from '../../utils/validateReport.js'

// Sticky horizontal scroller with section letters (A, B, C, ...) — tap to jump.
// Tracks which section is currently in view using IntersectionObserver.
// `report` (optional) → live completeness bar (filled/total + missing count),
// tap jumps to the first missing section. Same source as download validation.
export default function SectionNav({ sections, report }) {
  const [active, setActive] = useState(sections[0]?.id || null)

  // Live kompletność — liczona z tego samego validateReport co bramka pobierania,
  // więc % i lista braków są zawsze spójne. Tani, synchroniczny przelicz.
  const completeness = useMemo(() => (report ? validateReport(report) : null), [report])

  useEffect(() => {
    const ids = sections.map((s) => s.id).filter(Boolean)
    if (ids.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the section with greatest intersectionRatio that's currently visible.
        let bestId = null
        let bestRatio = 0
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > bestRatio) {
            bestRatio = e.intersectionRatio
            bestId = e.target.id
          }
        }
        if (bestId) setActive(bestId)
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  const jump = (id) => {
    const el = document.getElementById(id)
    if (!el) return
    const headerOffset = 130 // app header + nav height
    const y = el.getBoundingClientRect().top + window.scrollY - headerOffset
    window.scrollTo({ top: y, behavior: 'smooth' })
    setActive(id)
  }

  const pct = completeness && completeness.total
    ? Math.round((completeness.filled / completeness.total) * 100)
    : 0
  const jumpToFirstMissing = () => {
    const id = completeness?.missing?.[0]?.sectionId
    if (id) jump(id)
  }

  return (
    <nav className="sticky top-[60px] z-20 -mx-4 px-3 py-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-y border-gray-200 dark:border-gray-700 space-y-2">
      {completeness && (
        <button
          type="button"
          onClick={jumpToFirstMissing}
          disabled={completeness.ok}
          className="w-full flex items-center gap-2 text-left group"
          title={completeness.ok ? 'Raport kompletny' : 'Przejdź do pierwszego braku'}
        >
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={'h-full rounded-full transition-all ' + (completeness.ok ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={
            'text-[11px] font-medium tabular-nums shrink-0 ' +
            (completeness.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400 group-hover:underline')
          }>
            {completeness.ok
              ? '✓ Kompletny'
              : `Brakuje ${completeness.missing.length} · ${completeness.filled}/${completeness.total}`}
          </span>
        </button>
      )}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {sections.map((s) => {
          const isActive = active === s.id
          return (
            <button
              key={s.id}
              onClick={() => jump(s.id)}
              className={
                'whitespace-nowrap text-xs px-3 py-1.5 rounded-full font-medium transition shrink-0 ' +
                (isActive
                  ? 'bg-sure-blue text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700')
              }
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
