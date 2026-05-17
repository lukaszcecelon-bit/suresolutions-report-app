import { useEffect, useState } from 'react'

// Sticky horizontal scroller with section letters (A, B, C, ...) — tap to jump.
// Tracks which section is currently in view using IntersectionObserver.
export default function SectionNav({ sections }) {
  const [active, setActive] = useState(sections[0]?.id || null)

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

  return (
    <nav className="sticky top-[60px] z-20 -mx-4 px-3 py-2 bg-white/95 backdrop-blur border-y border-gray-200">
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
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
