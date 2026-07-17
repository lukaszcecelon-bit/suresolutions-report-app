// Wspólne metadane typów raportów + podział na STREFY (v0.42).
// Jedno źródło prawdy dla Start / Raporty / NewReport — wcześniej
// TYPE_LABELS i TYPE_ICONS były powielone w Home.jsx i NewReport.jsx.
//
// Strefy (decyzja użytkownika, 2026-07-17):
//  - „Dla klienta"  (niebieski, sure-blue) — dokumenty przekazywane klientowi:
//    serwis, SAT/FAT, uruchomienie.
//  - „Wewnętrzne"   (fiolet) — dokumentacja firmowa: prototyp, lekcja
//    projektowa oraz reklamacja (idzie do zakupowca → dostawcy; klient
//    jej nie widzi, więc w obiegu jest „wewnętrzna").

export const TYPE_LABELS = {
  commissioning: 'Uruchomienie / obserwacja maszyny',
  service: 'Serwis na obiekcie',
  prototype: 'Testy prototypu / podzespołu',
  satfat: 'SAT / FAT — odbiór maszyny',
  complaint: 'Reklamacja / zgłoszenie wady',
  lesson: 'Lekcja projektowa (feedback do konstrukcji)',
}

export const TYPE_ICONS = {
  commissioning: '▶',
  service: '🔧',
  prototype: '🧪',
  satfat: '📋',
  complaint: '🚩',
  lesson: '🎓',
}

export const CATEGORIES = [
  {
    key: 'client',
    label: 'Dla klienta',
    icon: '🏢',
    desc: 'Dokumenty, które trafiają do klienta',
    types: ['service', 'satfat', 'commissioning'],
  },
  {
    key: 'internal',
    label: 'Wewnętrzne',
    icon: '🔒',
    desc: 'Dokumentacja firmowa: konstrukcja, testy, dostawcy',
    types: ['prototype', 'lesson', 'complaint'],
  },
]

export function typeCategory(type) {
  return CATEGORIES.find((c) => c.types.includes(type))?.key || 'internal'
}

// Akcent strefy na kartach listy (kolor lewej krawędzi).
export const CATEGORY_ACCENT = {
  client: 'border-l-4 border-l-sure-blue',
  internal: 'border-l-4 border-l-violet-500',
}
