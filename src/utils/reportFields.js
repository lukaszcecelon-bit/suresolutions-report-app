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
