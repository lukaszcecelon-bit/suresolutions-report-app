// Walidacja raportu przed pobraniem paczki — wykrywa puste wymagane pola
// i pozwala pokazać użytkownikowi listę braków zanim wygeneruje "puste" PDF-y.
// Zwraca listę braków + sectionId do scroll-into-view. Brak = nie blokujemy
// pobierania, tylko pytamy "Pobrać mimo to?" przez confirm modal.

function get(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj)
}

function isEmpty(v) {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

// Pola nagłówka wspólne dla wszystkich typów (bez identyfikatora — ten jest
// per-typ: serwis używa numeru projektu, reszta numeru raportu).
const COMMON_HEADER = [
  { field: 'header.projectName',  label: 'Nazwa projektu',       sectionId: 'sec-header' },
  { field: 'header.machineName',  label: 'Nazwa / numer maszyny', sectionId: 'sec-header' },
  { field: 'header.date',         label: 'Data',                 sectionId: 'sec-header' },
  { field: 'header.author',       label: 'Autor',                sectionId: 'sec-header' },
]

export function validateReport(report) {
  const missing = []

  // Reklamacja — własna, minimalna walidacja (lean form, bez wspólnego nagłówka).
  if (report.type === 'complaint') {
    if (isEmpty(report.header?.projectNumber)) missing.push({ label: 'Numer projektu', sectionId: 'sec-ident' })
    if (isEmpty(report.partNo)) missing.push({ label: 'Numer / nazwa części', sectionId: 'sec-ident' })
    if (isEmpty(report.header?.author)) missing.push({ label: 'Zgłaszający', sectionId: 'sec-ident' })
    const hasPhoto = Array.isArray(report.media) && report.media.some((m) => m.kind === 'image')
    if (!hasPhoto) missing.push({ label: 'Co najmniej 1 zdjęcie wady', sectionId: 'sec-photos' })
    return { ok: missing.length === 0, missing }
  }

  // Identyfikator raportu — serwis/uruchomienie/prototyp/SAT-FAT wpisują NUMER
  // PROJEKTU, z którego auto-generuje się numer raportu. (Reklamacja obsłużona
  // wyżej i już wróciła.)
  if (isEmpty(report.header?.projectNumber)) {
    missing.push({ label: 'Numer projektu', sectionId: 'sec-header' })
  }

  for (const r of COMMON_HEADER) {
    if (isEmpty(get(report, r.field))) missing.push(r)
  }

  if (report.type === 'service') {
    if (isEmpty(report.visit?.client))   missing.push({ label: 'Nazwa klienta',   sectionId: 'sec-a' })
    if (isEmpty(report.visit?.location)) missing.push({ label: 'Lokalizacja',     sectionId: 'sec-a' })
    if (isEmpty(report.actions)) missing.push({
      label: 'Co najmniej 1 czynność (sekcja B)',
      sectionId: 'sec-b',
    })
  }

  if (report.type === 'commissioning') {
    if (!report.sessionStartAt) missing.push({
      label: 'Start sesji nie został rozpoczęty',
      sectionId: 'sec-header',
    })
  }

  if (report.type === 'prototype') {
    if (isEmpty(report.info?.component)) missing.push({ label: 'Podzespół testowany', sectionId: 'sec-a' })
    if (isEmpty(report.info?.goal))      missing.push({ label: 'Cel testu',           sectionId: 'sec-a' })
    if (isEmpty(report.points)) missing.push({
      label: 'Co najmniej 1 punkt kontrolny (sekcja C)',
      sectionId: 'sec-c',
    })
  }

  if (report.type === 'satfat') {
    if (isEmpty(report.info?.client))   missing.push({ label: 'Klient / Zamawiający', sectionId: 'sec-a' })
    if (isEmpty(report.info?.location)) missing.push({ label: 'Lokalizacja',          sectionId: 'sec-a' })
    if (isEmpty(report.tests))          missing.push({ label: 'Co najmniej 1 test (sekcja C)', sectionId: 'sec-c' })
  }

  return { ok: missing.length === 0, missing }
}

// Helper do uruchomienia walidacji + interakcji UI — wywołuje confirm
// z listą braków i scrolluje do pierwszej brakującej sekcji jeśli user odmówi.
// Wraca true gdy można kontynuować pobieranie (ok lub user nadpisał).
export async function ensureValidOrConfirm(report, confirm) {
  const v = validateReport(report)
  if (v.ok) return true

  const list = v.missing.map((m) => '• ' + m.label).join('\n')
  const proceed = await confirm(
    `Brakuje następujących pól:\n\n${list}\n\nCzy pobrać raport mimo to?`,
    {
      title: 'Niekompletny raport',
      confirmLabel: 'Pobierz mimo to',
      cancelLabel: 'Uzupełnij',
    }
  )

  if (!proceed) {
    // Scroll do pierwszej brakującej sekcji — najczęściej sec-header
    const firstSectionId = v.missing[0]?.sectionId
    if (firstSectionId) {
      const el = document.getElementById(firstSectionId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    return false
  }
  return true
}
