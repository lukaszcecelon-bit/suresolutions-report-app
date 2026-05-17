export default function NewReport({ navigate }) {
  const types = [
    {
      key: 'commissioning',
      icon: '▶',
      title: 'Uruchomienie / obserwacja maszyny',
      desc: 'Logowanie zatrzymań maszyny na żywo z timerem.',
      path: 'commissioning',
      active: true,
    },
    {
      key: 'service',
      icon: '🔧',
      title: 'Serwis na obiekcie',
      desc: 'Wizyta serwisowa: czynności, wymiana części, rekomendacje.',
      path: 'service',
      active: true,
    },
    {
      key: 'prototype',
      icon: '🧪',
      title: 'Testy prototypu / podzespołu',
      desc: 'Iteracyjne testy podzespołów — każda iteracja jako osobny PDF.',
      path: 'prototype',
      active: true,
    },
  ]

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Wróć</button>
      <h2 className="text-2xl font-bold text-sure-dark">Wybierz typ raportu</h2>
      <div className="space-y-3">
        {types.map((t) => (
          <button
            key={t.key}
            disabled={!t.active}
            onClick={() => t.active && navigate(t.path)}
            className={
              'w-full text-left card transition flex items-start gap-4 ' +
              (t.active
                ? 'hover:border-sure-blue hover:shadow cursor-pointer'
                : 'opacity-50 cursor-not-allowed')
            }
          >
            <div className="text-3xl">{t.icon}</div>
            <div className="flex-1">
              <div className="font-semibold text-sure-dark">{t.title}</div>
              <div className="text-sm text-gray-600 mt-1">{t.desc}</div>
              {!t.active && <div className="text-xs text-amber-600 mt-2">Dostępne w kolejnej fazie</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
