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

// Buduje pełną listę WYMAGANYCH pól z flagą spełnienia — jedno źródło dla
// walidacji przy pobieraniu (missing) ORAZ dla live-wskaźnika kompletności
// (filled/total). Dzięki temu % i lista braków nigdy się nie rozjadą.
function buildChecks(report) {
  const checks = []
  const req = (val, label, sectionId) => checks.push({ ok: !isEmpty(val), label, sectionId })

  // Reklamacja — własna, minimalna walidacja (lean form, bez wspólnego nagłówka).
  if (report.type === 'complaint') {
    req(report.header?.projectNumber, 'Numer projektu', 'sec-ident')
    req(report.partNo, 'Numer / nazwa części', 'sec-ident')
    req(report.header?.author, 'Zgłaszający', 'sec-ident')
    const hasPhoto = Array.isArray(report.media) && report.media.some((m) => m.kind === 'image')
    checks.push({ ok: hasPhoto, label: 'Co najmniej 1 zdjęcie wady', sectionId: 'sec-photos' })
    return checks
  }

  // Identyfikator raportu — serwis/uruchomienie/prototyp/SAT-FAT wpisują NUMER
  // PROJEKTU, z którego auto-generuje się numer raportu.
  req(report.header?.projectNumber, 'Numer projektu', 'sec-header')
  for (const r of COMMON_HEADER) req(get(report, r.field), r.label, r.sectionId)

  if (report.type === 'service') {
    // Klient/lokalizacja od v0.52 w header (edytowane w sekcji A) — sectionId
    // celowo zostaje 'sec-a', bo tam użytkownik je wpisuje.
    req(report.header?.client, 'Nazwa klienta', 'sec-a')
    req(report.header?.location, 'Lokalizacja', 'sec-a')
    req(report.actions, 'Co najmniej 1 czynność (sekcja B)', 'sec-b')
  }
  if (report.type === 'commissioning') {
    checks.push({ ok: !!report.sessionStartAt, label: 'Start sesji nie został rozpoczęty', sectionId: 'sec-header' })
  }
  if (report.type === 'prototype') {
    req(report.info?.component, 'Podzespół testowany', 'sec-a')
    req(report.info?.goal, 'Cel testu', 'sec-a')
    req(report.points, 'Co najmniej 1 punkt kontrolny (sekcja C)', 'sec-c')
  }
  if (report.type === 'satfat') {
    req(report.header?.client, 'Klient / Zamawiający', 'sec-a')
    req(report.header?.location, 'Lokalizacja', 'sec-a')
    req(report.tests, 'Co najmniej 1 test (sekcja C)', 'sec-c')
  }
  if (report.type === 'lesson') {
    req(report.problem, 'Opis błędu (sekcja B)', 'sec-b')
    req(report.category, 'Kategoria błędu (sekcja C)', 'sec-c')
    req(report.lessons, 'Co najmniej 1 wniosek (sekcja E)', 'sec-e')
  }
  return checks
}

export function validateReport(report) {
  const checks = buildChecks(report)
  const missing = checks.filter((c) => !c.ok).map(({ label, sectionId }) => ({ label, sectionId }))
  return { ok: missing.length === 0, missing, total: checks.length, filled: checks.length - missing.length }
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
