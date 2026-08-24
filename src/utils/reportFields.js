// Pola przekrojowe raportu, czytane w JEDNYM miejscu.
//
// Od v0.52 klient i lokalizacja mieszkają w `header` — wcześniej siedziały w
// polach per-typ (`service.visit`, `satfat.info`), więc uruchomienia, prototypy
// i lekcje w ogóle nie miały klienta i wypadały z analiz „per klient".
// Migracja v3→v4 (storage.migrateReport) przenosi stare wartości do header;
// fallback poniżej zostaje dla paczek .suresync zaimportowanych ze starszej
// wersji apki, zanim migracja przy odczycie je dotknie.
import { minutesBetween } from './time.js'

export function reportClient(r) {
  return (r?.header?.client || r?.visit?.client || r?.info?.client || '').trim()
}

export function reportLocation(r) {
  return (r?.header?.location || r?.visit?.location || r?.info?.location || '').trim()
}

// Godziny „od–do" wpisywane ręcznie: serwis = przyjazd/odjazd obiektu,
// SAT/FAT i prototyp = start/koniec testu (dodane w v0.52).
export function reportTimeRange(r) {
  if (!r) return { from: '', to: '' }
  if (r.type === 'service') return { from: r.visit?.arrival || '', to: r.visit?.departure || '' }
  if (r.type === 'satfat' || r.type === 'prototype') {
    return { from: r.info?.startTime || '', to: r.info?.endTime || '' }
  }
  return { from: '', to: '' }
}

// Numery części z ticketu montażowego jako jeden tekst („25-104-03, 25-104-07").
// Jedno źródło dla PDF, rejestru XLSX i eksportu analitycznego. Znosi też same
// stringi w liście, żeby ręcznie poprawiona paczka .suresync nie wywracała widoku.
export function partNosLabel(r) {
  return (Array.isArray(r?.partNos) ? r.partNos : [])
    .map((p) => (typeof p === 'string' ? p : p?.no))
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .join(', ')
}

// Pola wypełniane AUTOMATYCZNIE (data = dziś, autor i rola z Ustawień, domyślne
// statusy/tryby) albo techniczne. Nie świadczą o tym, że użytkownik cokolwiek
// wprowadził, więc przy ocenie „czy raport jest pusty" ich nie liczymy.
const AUTO_FILLED_KEYS = new Set([
  'id', 'type', 'status', 'createdAt', 'updatedAt', 'schemaVersion',
  'reportNumber', 'date', 'author',
  'role', 'visitStatus',            // serwis
  'phase',                          // uruchomienie
  'testType', 'finalStatus',        // SAT/FAT
  'iteration', 'sampleMethod',      // prototyp
])

// Czy raport nie ma JESZCZE żadnej treści od użytkownika. Liczy się każdy
// niepusty tekst, każda pozycja listy i każde `true` (np. `manual` w trybie
// ręcznym — to świadoma decyzja, potwierdzana w oknie dialogowym).
//
// Po co: jedno przypadkowe tapnięcie w przełącznik statusu albo w pole zapisywało
// raport do bazy i zostawał tam na zawsze — lista zapełniała się pustymi
// szkicami, których nikt nie chciał (v1.2).
//
// Kierunek ewentualnej pomyłki jest świadomy: gdyby jakiegoś domyślnego pola
// zabrakło na liście powyżej, raport wyjdzie „niepusty" i zapisze się tak jak
// dotąd. Nigdy odwrotnie — więc realna treść nie może przez to zniknąć.
export function isBlankReport(r) {
  if (!r || typeof r !== 'object') return true
  let blank = true
  const walk = (val, key) => {
    if (!blank) return
    if (Array.isArray(val)) { if (val.length) blank = false; return }
    if (val && typeof val === 'object') {
      for (const k of Object.keys(val)) walk(val[k], k)
      return
    }
    if (AUTO_FILLED_KEYS.has(key)) return
    if (typeof val === 'string') { if (val.trim()) blank = false; return }
    if (typeof val === 'number') { if (val) blank = false; return }
    if (val === true) blank = false
  }
  walk(r, null)
  return blank
}

// Kilometry dojazdu (serwis, v0.53) — przechowywane jako ŁĄCZNY dystans w obie
// strony, bo to ta liczba idzie do rozliczenia. Jedna reguła odczytu i
// formatowania dla formularza, PDF i eksportu, żeby „128 km" nie rozjechało się
// między miejscami. Zwraca null przy braku danych (0 km to inna informacja).
export function travelKm(r) {
  const v = r?.visit?.travelKm
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function travelKmLabel(r) {
  const n = travelKm(r)
  return n === null ? '' : `${String(n).replace('.', ',')} km`
}

// Czas trwania raportu w minutach, albo null gdy nie da się go ustalić.
// Uruchomienie liczy się ze znaczników sesji (przycisk start/stop), pozostałe
// typy z godzin wpisanych ręcznie. Reklamacja i lekcja nie mają czasu trwania.
export function reportMinutes(r) {
  if (!r) return null
  if (r.type === 'commissioning') {
    if (!r.sessionStartAt || !r.sessionEndAt) return null
    const ms = new Date(r.sessionEndAt) - new Date(r.sessionStartAt)
    return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : null
  }
  const { from, to } = reportTimeRange(r)
  return minutesBetween(from, to)
}
