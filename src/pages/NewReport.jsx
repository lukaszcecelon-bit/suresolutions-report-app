// All three report types are now implemented; remove dead `active` toggle that pre-MVP
// kept some tiles greyed-out. Layout stays a simple stack of three big tappable cards.
const TYPES = [
  {
    key: 'commissioning',
    icon: '▶',
    title: 'Uruchomienie / obserwacja maszyny',
    desc: 'Logowanie zatrzymań maszyny na żywo z timerem.',
    path: 'commissioning',
  },
  {
    key: 'service',
    icon: '🔧',
    title: 'Serwis na obiekcie',
    desc: 'Wizyta serwisowa: czynności, wymiana części, rekomendacje.',
    path: 'service',
  },
  {
    key: 'prototype',
    icon: '🧪',
    title: 'Testy prototypu / podzespołu',
    desc: 'Iteracyjne testy podzespołów — każda iteracja jako osobny PDF.',
    path: 'prototype',
  },
]

export default function NewReport({ navigate }) {
  return (
    <div className="space-y-4">
      <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Wróć</button>
      <h2 className="text-2xl font-bold text-sure-dark">Wybierz typ raportu</h2>
      <div className="space-y-3">
        {TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate(t.path)}
            className="w-full text-left card flex items-start gap-4
                       hover:border-sure-blue hover:shadow transition cursor-pointer
                       focus:outline-none focus:ring-2 focus:ring-sure-blue/40
                       min-h-[88px]"
          >
            <div className="text-3xl shrink-0">{t.icon}</div>
            <div className="flex-1">
              <div className="font-semibold text-sure-dark text-base">{t.title}</div>
              <div className="text-sm text-gray-600 mt-1">{t.desc}</div>
            </div>
            <div className="text-sure-blue text-2xl shrink-0 self-center" aria-hidden="true">›</div>
          </button>
        ))}
      </div>
    </div>
  )
}
