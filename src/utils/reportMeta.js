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

// Krótkie etykiety do ciasnych miejsc (skróty „nowy raport" na pulpicie,
// chipy) — pełne TYPE_LABELS są za długie na przycisk szerokości 1/3 ekranu.
export const TYPE_SHORT = {
  commissioning: 'Uruchomienie',
  service: 'Serwis',
  prototype: 'Prototyp',
  satfat: 'SAT / FAT',
  complaint: 'Reklamacja',
  lesson: 'Lekcja',
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

// === Słowniki wartości pól: klucz zapisany w danych → etykieta ===
// Dodane w v0.52 dla eksportu analitycznego: arkusz musi nazywać wartości tak
// samo jak formularz, a jednocześnie wieźć surowy klucz (etykiety się zmieniają,
// klucze nie). UWAGA: moduły PDF trzymają własne mapy klucz→BADGE (etykieta +
// kolor) — przy zmianie NAZWY zaktualizuj też odpowiedni plik w utils/pdf/.
export const VISIT_STATUS_LABELS = {
  completed: 'Zakończono (maszyna działa)',
  followup: 'Wymaga spotkania / dalszych działań',
  parts: 'Maszyna zatrzymana',
}
export const PART_PRIORITY_LABELS = { urgent: 'Pilne', planned: 'Planowe', watch: 'Obserwacja' }
export const TEST_STATUS_LABELS = { pass: 'Zaliczony', fail: 'Niezaliczony', conditional: 'Warunkowo', na: 'N/A' }
export const PUNCH_PRIORITY_LABELS = { critical: 'Krytyczne', major: 'Istotne', minor: 'Drobne' }
export const SATFAT_FINAL_LABELS = {
  accepted: 'Zaakceptowano',
  conditional: 'Zaakceptowano warunkowo',
  rejected: 'Odrzucono',
}
export const POINT_RESULT_LABELS = { ok: 'OK', nok: 'NOK', cond: 'Warunkowo' }
export const PROTO_OVERALL_LABELS = { positive: 'Pozytywny', negative: 'Negatywny', conditional: 'Warunkowo pozytywny' }
export const PROTO_DECISION_LABELS = {
  implement: 'Wdrożyć rozwiązanie',
  iterate: 'Poprawki / kolejna iteracja',
  reject: 'Odrzucić koncepcję',
}
export const SAMPLE_METHOD_LABELS = { print3d: 'Druk 3D', cnc: 'Obróbka CNC', other: 'Inne' }
export const STATUS_LABELS = { draft: 'Roboczy', completed: 'Ukończony' }

// Akcent strefy na kartach listy (kolor lewej krawędzi).
export const CATEGORY_ACCENT = {
  client: 'border-l-4 border-l-sure-blue',
  internal: 'border-l-4 border-l-violet-500',
}
