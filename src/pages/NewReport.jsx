import { CATEGORIES, TYPE_LABELS, TYPE_ICONS } from '../utils/reportMeta.js'

// Wybór typu raportu (v0.42) — typy pogrupowane w DWIE STREFY zamiast
// płaskiej listy sześciu kafli:
//  🏢 Dla klienta (niebieska)  — serwis, SAT/FAT, uruchomienie,
//  🔒 Wewnętrzne  (fioletowa)  — prototyp, ticket z montażu, reklamacja.
// Kolor strefy powtarza się na liście raportów (akcent karty) i w segmencie
// zakładki Raporty — jeden język wizualny w całej aplikacji.

const TYPE_DESCS = {
  commissioning: 'Logowanie zatrzymań maszyny na żywo z timerem.',
  service: 'Wizyta serwisowa: czynności, wymiana części, rekomendacje.',
  prototype: 'Iteracyjne testy podzespołów — każda iteracja jako osobny PDF.',
  satfat: 'Lista testów odbiorowych z punchlistą — live na placu / w fabryce.',
  complaint: 'Szybkie zgłoszenie wadliwej części — zdjęcie + dane, PDF do zakupowca.',
  lesson: 'Zgłoszenie z hali do konstrukcji — co było źle w projekcie.',
}

// Style stref: kontener + nagłówek (spójne z segmentem w zakładce Raporty).
const ZONE_STYLES = {
  client: {
    box: 'border-sure-blue/30 bg-sure-blue/5 dark:bg-sure-blue/10',
    head: 'text-sure-blue',
  },
  internal: {
    box: 'border-violet-400/40 bg-violet-500/5 dark:bg-violet-500/10',
    head: 'text-violet-600 dark:text-violet-400',
  },
}

export default function NewReport({ navigate }) {
  return (
    <div className="space-y-4">
      <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Wróć</button>
      <h2 className="text-2xl font-bold text-sure-dark dark:text-gray-100">Wybierz typ raportu</h2>

      {CATEGORIES.map((cat) => {
        const z = ZONE_STYLES[cat.key] || ZONE_STYLES.internal
        return (
          <section key={cat.key} className={'rounded-2xl border p-3 sm:p-4 ' + z.box}>
            <div className={'flex items-center gap-2 mb-1 font-semibold text-sm uppercase tracking-wider ' + z.head}>
              <span className="text-base leading-none">{cat.icon}</span>
              {cat.label}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{cat.desc}</p>

            <div className="space-y-2">
              {cat.types.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => navigate(type)}
                  className="w-full text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                             rounded-xl p-4 flex items-start gap-4
                             hover:border-sure-blue hover:shadow transition cursor-pointer
                             focus:outline-none focus:ring-2 focus:ring-sure-blue/40"
                >
                  <div className="text-3xl shrink-0">{TYPE_ICONS[type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sure-dark dark:text-gray-100 text-base">{TYPE_LABELS[type]}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{TYPE_DESCS[type]}</div>
                  </div>
                  <div className="text-sure-blue text-2xl shrink-0 self-center" aria-hidden="true">›</div>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
