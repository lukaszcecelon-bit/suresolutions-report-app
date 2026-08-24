// EKSPORT ANALITYCZNY — cała baza raportów w płaskich tabelach do analizy.
//
// Po co osobna warstwa: PDF jest dokumentem, a raport w localStorage to
// zagnieżdżony JSON (listy w listach). Żadne z tego nie wchodzi do tabeli
// przestawnej. Ten moduł WYLICZA z raportów gwiazdę: tabelę faktów (1 wiersz =
// 1 raport + policzone miary) i tabele-dzieci (1 wiersz = 1 zatrzymanie /
// część / test / …). Model danych apki zostaje nietknięty — to warstwa
// pochodna, więc można ją przebudować bez migracji i bez ryzyka dla raportów.
//
// Zasady (świadome, żeby dane dały się analizować też za dwa lata):
//  • surowe wartości, nie sformatowane: czas w MINUTACH jako liczba, nie „3 h 20 min",
//  • klucz + etykieta w osobnych kolumnach (istotnosc_key=critical / Istotność=Krytyczny),
//    bo etykiety z czasem się zmieniają, a klucze w danych nie,
//  • PUSTA komórka = „nie dotyczy", NIE zero — inaczej średnie w Excelu kłamią,
//  • każdy wiersz-dziecko wiezie report_id + datę + projekt + maszynę + klienta,
//    więc każdy arkusz pivotuje się samodzielnie, bez budowania relacji,
//  • każdy plik stemplowany wersją apki, wersją schematu i datą eksportu.
//
// Dwa wyjścia z jednego zbioru: XLSX (nagłówki po polsku — dla człowieka i
// tabel przestawnych) oraz JSONL (klucze ASCII snake_case — dla Power BI /
// Pythona). Każda kolumna zna oba nazewnictwa: `key` (PL) i `id` (snake).
import { collectMediaIds, SCHEMA_VERSION } from './storage.js'
import { reportClient, reportLocation, reportTimeRange, reportMinutes, travelKm, partNosLabel } from './reportFields.js'
import { APP_VERSION } from './version.js'
import { LESSON_SEVERITIES } from './settings.js'
import {
  TYPE_SHORT, STATUS_LABELS, VISIT_STATUS_LABELS, PART_PRIORITY_LABELS,
  TEST_STATUS_LABELS, PUNCH_PRIORITY_LABELS, SATFAT_FINAL_LABELS,
  POINT_RESULT_LABELS, PROTO_OVERALL_LABELS, PROTO_DECISION_LABELS,
  SAMPLE_METHOD_LABELS,
} from './reportMeta.js'

const SEV_LABEL = Object.fromEntries(LESSON_SEVERITIES.map((s) => [s.key, s.label]))

// ---------- Drobne narzędzia ----------
const list = (v) => (Array.isArray(v) ? v : [])
const txt = (v) => (v === null || v === undefined ? '' : String(v).trim())
const isNum = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))
const round1 = (v) => Math.round(v * 10) / 10
// Udział w procentach (0–100, jedno miejsce po przecinku). Brak mianownika →
// pusto, nie 0 — „brak danych" i „zero procent" to dwie różne informacje.
const pct = (part, total) => (total > 0 ? round1((part / total) * 100) : '')
const countImages = (media) => list(media).filter((m) => m?.kind === 'image').length
const label = (map, key) => (key ? (map[key] || key) : '')

// ---------- Miary liczone RAZ na raport ----------
// Gettery kolumn dostają gotowy obiekt `m`, więc te same listy nie są
// przeliczane po kilka razy (przy 60 kolumnach robi to różnicę).
function measures(r) {
  const media = collectMediaIds(r)
  const time = reportTimeRange(r)
  const m = {
    photos: media.photos.size,
    videos: media.videos.size,
    minutes: reportMinutes(r) ?? '',
    client: reportClient(r),
    location: reportLocation(r),
    from: time.from,
    to: time.to,
    notes: 0,   // suma wpisów opisowych (obserwacje + rekomendacje + wnioski)
  }

  if (r.type === 'service') {
    const parts = list(r.parts)
    const anyQty = parts.some((p) => isNum(p.qty))
    m.actions = list(r.actions).length
    m.parts = parts.length
    m.partsUrgent = parts.filter((p) => p.priority === 'urgent').length
    // Suma sztuk tylko gdy KTOŚ wpisał ilość — inaczej „0 szt." sugerowałoby,
    // że nic nie wymieniono, a to znaczy tylko „nie podano".
    m.partsQty = anyQty ? parts.reduce((s, p) => s + (isNum(p.qty) ? Number(p.qty) : 0), 0) : ''
    m.notes = list(r.observations).length + list(r.recommendations).length
  }

  if (r.type === 'commissioning') {
    const stops = list(r.stops)
    const runMin = reportMinutes(r)
    const stopMin = round1(stops.reduce((s, st) => s + (Number(st.durationMs) || 0), 0) / 60000)
    m.stops = stops.length
    m.stopMin = stopMin
    m.longestStopMin = stops.length
      ? round1(Math.max(...stops.map((s) => Number(s.durationMs) || 0)) / 60000)
      : ''
    // Dostępność = (czas sesji − czas zatrzymań) / czas sesji. Bez zamkniętej
    // sesji nie ma mianownika, więc zostaje pusto.
    m.availability = runMin ? pct(Math.max(0, runMin - stopMin), runMin) : ''
    m.mtbf = runMin && stops.length ? round1(runMin / stops.length) : ''
    m.mttr = stops.length ? round1(stopMin / stops.length) : ''
    m.notes = list(r.observations).length + list(r.conclusions).length
  }

  if (r.type === 'satfat') {
    const tests = list(r.tests)
    const punch = list(r.punchlist)
    const na = tests.filter((t) => t.status === 'na').length
    m.tests = tests.length
    m.testsPass = tests.filter((t) => t.status === 'pass').length
    m.testsFail = tests.filter((t) => t.status === 'fail').length
    m.testsCond = tests.filter((t) => t.status === 'conditional').length
    m.testsNa = na
    // FPY liczone BEZ testów N/A — „nie dotyczy" nie jest ani zaliczeniem,
    // ani oblaniem, więc nie ma prawa psuć wskaźnika.
    m.fpy = pct(m.testsPass, tests.length - na)
    m.punch = punch.length
    m.punchCritical = punch.filter((p) => p.priority === 'critical').length
    m.participants = list(r.participants?.client).length + list(r.participants?.vendor).length
    m.notes = list(r.conclusions).length
  }

  if (r.type === 'prototype') {
    const points = list(r.points)
    m.points = points.length
    m.pointsOk = points.filter((p) => p.result === 'ok').length
    m.pointsNok = points.filter((p) => p.result === 'nok').length
    m.pointsCond = points.filter((p) => p.result === 'cond').length
    m.params = list(r.conditions?.params).length
    m.notes = txt(r.observations) ? 1 : 0
  }

  if (r.type === 'lesson') m.notes = list(r.lessons).length

  return m
}

// ---------- Tabela faktów: 1 wiersz = 1 raport ----------
// Kolejność w blokach: identyfikacja → miary wspólne → per typ → meta.
// Kolumny nie dotyczące danego typu zostają PUSTE (patrz zasady w nagłówku).
const FACT_COLUMNS = [
  // — identyfikacja —
  { key: 'report_id',      id: 'report_id',        width: 22, get: (r) => r.id },
  { key: 'Typ',            id: 'typ',              width: 14, get: (r) => TYPE_SHORT[r.type] || r.type },
  { key: 'typ_key',        id: 'typ_key',          width: 13, get: (r) => r.type },
  { key: 'Numer',          id: 'numer_raportu',    width: 22, get: (r) => txt(r.header?.reportNumber) },
  { key: 'Data',           id: 'data',             width: 11, get: (r) => txt(r.header?.date) || txt(r.createdAt).slice(0, 10) },
  { key: 'Rok',            id: 'rok',              width: 6,  get: (r) => Number(txt(r.header?.date).slice(0, 4)) || '' },
  { key: 'Miesiąc',        id: 'miesiac',          width: 9,  get: (r) => txt(r.header?.date).slice(0, 7) },
  { key: 'Nr projektu',    id: 'nr_projektu',      width: 13, get: (r) => txt(r.header?.projectNumber) },
  { key: 'Projekt',        id: 'projekt',          width: 20, get: (r) => txt(r.header?.projectName) },
  { key: 'Maszyna',        id: 'maszyna',          width: 20, get: (r) => txt(r.header?.machineName) },
  { key: 'Klient',         id: 'klient',           width: 18, get: (r, m) => m.client },
  { key: 'Lokalizacja',    id: 'lokalizacja',      width: 18, get: (r, m) => m.location },
  { key: 'Autor',          id: 'autor',            width: 16, get: (r) => txt(r.header?.author) },
  { key: 'Status',         id: 'status',           width: 11, get: (r) => label(STATUS_LABELS, r.status) },
  { key: 'status_key',     id: 'status_key',       width: 11, get: (r) => txt(r.status) },
  // — miary wspólne —
  { key: 'Od',             id: 'od',               width: 7,  get: (r, m) => m.from },
  { key: 'Do',             id: 'do',               width: 7,  get: (r, m) => m.to },
  { key: 'Czas [min]',     id: 'czas_min',         width: 11, get: (r, m) => m.minutes },
  { key: 'Zdjęcia',        id: 'zdjecia',          width: 8,  get: (r, m) => m.photos },
  { key: 'Wideo',          id: 'wideo',            width: 7,  get: (r, m) => m.videos },
  { key: 'Wpisy opisowe',  id: 'wpisy_opisowe',    width: 13, get: (r, m) => m.notes },
  // — serwis —
  { key: 'Rola',           id: 'rola',             width: 16, get: (r) => (r.type === 'service' ? txt(r.role) : '') },
  { key: 'Osoby obecne',   id: 'osoby_obecne',     width: 12, get: (r) => (r.type === 'service' && isNum(r.visit?.attendees) ? Number(r.visit.attendees) : '') },
  // Liczba bez jednostki (jednostka w nagłówku) — inaczej suma po kolumnie w
  // Excelu nie zadziała. Łączny dystans w obie strony, patrz reportFields.js.
  { key: 'Dojazd [km]',    id: 'dojazd_km',        width: 12, get: (r) => travelKm(r) ?? '' },
  { key: 'Status wizyty',  id: 'status_wizyty',    width: 24, get: (r) => (r.type === 'service' ? label(VISIT_STATUS_LABELS, r.visitStatus) : '') },
  { key: 'wizyta_key',     id: 'status_wizyty_key', width: 11, get: (r) => (r.type === 'service' ? txt(r.visitStatus) : '') },
  { key: 'Czynności',      id: 'czynnosci',        width: 10, get: (r, m) => m.actions ?? '' },
  { key: 'Części',         id: 'czesci',           width: 8,  get: (r, m) => m.parts ?? '' },
  { key: 'Części pilne',   id: 'czesci_pilne',     width: 12, get: (r, m) => m.partsUrgent ?? '' },
  { key: 'Części [szt.]',  id: 'czesci_szt',       width: 12, get: (r, m) => m.partsQty ?? '' },
  { key: 'Odbiór prac',    id: 'odbior_prac',      width: 18, get: (r) => (r.type === 'service' ? txt(r.receivedBy) : '') },
  // — uruchomienie —
  // Godziny wpisane ręcznie vs zmierzone stoperem — bez tego nie da się
  // odsiać sesji odtwarzanych z pamięci przy liczeniu dostępności czy MTBF.
  { key: 'Wypełniony ręcznie', id: 'recznie',      width: 16, get: (r) => (r.type === 'commissioning' ? (r.manual ? 'tak' : 'nie') : '') },
  { key: 'Start sesji',    id: 'start_sesji',      width: 20, get: (r) => (r.type === 'commissioning' ? txt(r.sessionStartAt) : '') },
  { key: 'Koniec sesji',   id: 'koniec_sesji',     width: 20, get: (r) => (r.type === 'commissioning' ? txt(r.sessionEndAt) : '') },
  { key: 'Zatrzymania',    id: 'zatrzymania',      width: 12, get: (r, m) => m.stops ?? '' },
  { key: 'Czas zatrzymań [min]', id: 'zatrzymania_min', width: 18, get: (r, m) => m.stopMin ?? '' },
  { key: 'Najdłuższe zatrzymanie [min]', id: 'najdluzsze_zatrzymanie_min', width: 22, get: (r, m) => m.longestStopMin ?? '' },
  { key: 'Dostępność [%]', id: 'dostepnosc_pct',   width: 14, get: (r, m) => m.availability ?? '' },
  { key: 'MTBF [min]',     id: 'mtbf_min',         width: 11, get: (r, m) => m.mtbf ?? '' },
  { key: 'MTTR [min]',     id: 'mttr_min',         width: 11, get: (r, m) => m.mttr ?? '' },
  // — SAT / FAT —
  { key: 'Typ odbioru',    id: 'typ_odbioru',      width: 11, get: (r) => (r.type === 'satfat' ? String(r.testType || 'fat').toUpperCase() : '') },
  { key: 'Testy',          id: 'testy',            width: 7,  get: (r, m) => m.tests ?? '' },
  { key: 'Testy zaliczone', id: 'testy_pass',      width: 14, get: (r, m) => m.testsPass ?? '' },
  { key: 'Testy niezaliczone', id: 'testy_fail',   width: 16, get: (r, m) => m.testsFail ?? '' },
  { key: 'Testy warunkowo', id: 'testy_cond',      width: 14, get: (r, m) => m.testsCond ?? '' },
  { key: 'Testy N/A',      id: 'testy_na',         width: 10, get: (r, m) => m.testsNa ?? '' },
  { key: 'FPY [%]',        id: 'fpy_pct',          width: 9,  get: (r, m) => m.fpy ?? '' },
  { key: 'Usterki',        id: 'usterki',          width: 9,  get: (r, m) => m.punch ?? '' },
  { key: 'Usterki krytyczne', id: 'usterki_krytyczne', width: 16, get: (r, m) => m.punchCritical ?? '' },
  { key: 'Wynik odbioru',  id: 'wynik_odbioru',    width: 24, get: (r) => (r.type === 'satfat' ? label(SATFAT_FINAL_LABELS, r.finalStatus) : '') },
  { key: 'wynik_key',      id: 'wynik_odbioru_key', width: 12, get: (r) => (r.type === 'satfat' ? txt(r.finalStatus) : '') },
  { key: 'Uczestnicy',     id: 'uczestnicy',       width: 11, get: (r, m) => m.participants ?? '' },
  { key: 'Dokument ref.',  id: 'dokument_ref',     width: 22, get: (r) => (r.type === 'satfat' ? txt(r.info?.referenceDoc) : '') },
  // — prototyp —
  { key: 'Podzespół',      id: 'podzespol',        width: 20, get: (r) => (r.type === 'prototype' ? txt(r.info?.component) : '') },
  { key: 'Iteracja',       id: 'iteracja',         width: 9,  get: (r) => (r.type === 'prototype' ? (Number(r.info?.iteration) || 1) : '') },
  { key: 'Metoda próbki',  id: 'metoda_probki',    width: 14, get: (r) => {
    if (r.type !== 'prototype') return ''
    return r.info?.sampleMethod === 'other'
      ? (txt(r.info?.sampleMethodOther) || 'Inne')
      : label(SAMPLE_METHOD_LABELS, r.info?.sampleMethod)
  } },
  { key: 'Punkty',         id: 'punkty',           width: 8,  get: (r, m) => m.points ?? '' },
  { key: 'Punkty OK',      id: 'punkty_ok',        width: 10, get: (r, m) => m.pointsOk ?? '' },
  { key: 'Punkty NOK',     id: 'punkty_nok',       width: 11, get: (r, m) => m.pointsNok ?? '' },
  { key: 'Punkty warunkowo', id: 'punkty_cond',    width: 16, get: (r, m) => m.pointsCond ?? '' },
  { key: 'Ocena ogólna',   id: 'ocena_ogolna',     width: 20, get: (r) => (r.type === 'prototype' ? label(PROTO_OVERALL_LABELS, r.overallResult) : '') },
  { key: 'Decyzja',        id: 'decyzja',          width: 24, get: (r) => (r.type === 'prototype' ? label(PROTO_DECISION_LABELS, r.decision) : '') },
  { key: 'decyzja_key',    id: 'decyzja_key',      width: 12, get: (r) => (r.type === 'prototype' ? txt(r.decision) : '') },
  // — ticket z montażu (Lesson Learned) —
  { key: 'Numery części',  id: 'numery_czesci',    width: 22, get: (r) => (r.type === 'lesson' ? partNosLabel(r) : '') },
  { key: 'Etap wykrycia',  id: 'etap_wykrycia',    width: 14, get: (r) => (r.type === 'lesson' ? txt(r.stage) : '') },
  { key: 'Kategoria błędu', id: 'kategoria_bledu', width: 20, get: (r) => (r.type === 'lesson' ? txt(r.category) : '') },
  { key: 'Istotność',      id: 'istotnosc',        width: 12, get: (r) => (r.type === 'lesson' ? label(SEV_LABEL, r.severity) : '') },
  { key: 'istotnosc_key',  id: 'istotnosc_key',    width: 13, get: (r) => (r.type === 'lesson' ? txt(r.severity) : '') },
  { key: 'Nr rysunku',     id: 'nr_rysunku',       width: 14, get: (r) => (r.type === 'lesson' ? txt(r.drawingNo) : '') },
  // — reklamacja —
  { key: 'Część',          id: 'czesc',            width: 20, get: (r) => (r.type === 'complaint' ? txt(r.partNo) : '') },
  { key: 'Dostawca',       id: 'dostawca',         width: 20, get: (r) => (r.type === 'complaint' ? txt(r.supplier) : '') },
  { key: 'Kategoria wady', id: 'kategoria_wady',   width: 20, get: (r) => (r.type === 'complaint' ? txt(r.defectCategory) : '') },
  { key: 'Blokuje montaż', id: 'blokuje_montaz',   width: 14, get: (r) => (r.type === 'complaint' ? (r.blocksAssembly ? 'TAK' : 'nie') : '') },
  // — meta —
  { key: 'Utworzono',      id: 'utworzono',        width: 21, get: (r) => txt(r.createdAt) },
  { key: 'Zaktualizowano', id: 'zaktualizowano',   width: 21, get: (r) => txt(r.updatedAt) },
  { key: 'schemat',        id: 'schemat',          width: 9,  get: (r) => Number(r.schemaVersion) || '' },
]

// Kolumny wspólne KAŻDEJ tabeli-dziecka — pozwalają pivotować arkusz dziecka
// bez sięgania do tabeli faktów (redundancja tu jest celowa).
const CHILD_KEYS = [
  { key: 'report_id',   id: 'report_id',     width: 22, get: (r) => r.id },
  { key: 'Numer',       id: 'numer_raportu', width: 22, get: (r) => txt(r.header?.reportNumber) },
  { key: 'Data',        id: 'data',          width: 11, get: (r) => txt(r.header?.date) || txt(r.createdAt).slice(0, 10) },
  { key: 'Nr projektu', id: 'nr_projektu',   width: 13, get: (r) => txt(r.header?.projectNumber) },
  { key: 'Maszyna',     id: 'maszyna',       width: 20, get: (r) => txt(r.header?.machineName) },
  { key: 'Klient',      id: 'klient',        width: 18, get: (r) => reportClient(r) },
]

// Tabele-dzieci: `rows(report)` zwraca listę wierszy (bez kolumn wspólnych).
const CHILD_TABLES = [
  {
    sheet: 'Zatrzymania',
    id: 'zatrzymania',
    types: ['commissioning'],
    columns: [
      { key: 'Nr',            id: 'nr',            width: 6,  get: (s, i) => i + 1 },
      { key: 'Start',         id: 'start',         width: 21, get: (s) => txt(s.startAt) },
      { key: 'Koniec',        id: 'koniec',        width: 21, get: (s) => txt(s.endAt) },
      { key: 'Godzina',       id: 'godzina',       width: 9,  get: (s) => (s.startAt ? txt(s.startAt).slice(11, 16) : '') },
      { key: 'Czas [s]',      id: 'czas_s',        width: 10, get: (s) => (isNum(s.durationMs) ? Math.round(Number(s.durationMs) / 1000) : '') },
      { key: 'Czas [min]',    id: 'czas_min',      width: 11, get: (s) => (isNum(s.durationMs) ? round1(Number(s.durationMs) / 60000) : '') },
      // Powód „rozwiązany" (Inne → wpisany tekst) do Pareto + surowy klucz
      // słownikowy, żeby dało się zmierzyć udział „Inne" i uzupełnić słownik.
      { key: 'Powód',         id: 'powod',         width: 26, get: (s) => (s.reason === 'Inne' && txt(s.customReason) ? txt(s.customReason) : txt(s.reason)) },
      { key: 'powod_slownik', id: 'powod_slownik', width: 20, get: (s) => txt(s.reason) },
      { key: 'Komentarz',     id: 'komentarz',     width: 40, get: (s) => txt(s.comment) },
      { key: 'Zdjęcia',       id: 'zdjecia',       width: 8,  get: (s) => countImages(s.media) },
    ],
    rows: (r) => list(r.stops),
  },
  {
    sheet: 'Czynności',
    id: 'czynnosci',
    types: ['service'],
    columns: [
      { key: 'Nr',      id: 'nr',      width: 6,  get: (a, i) => i + 1 },
      { key: 'Opis',    id: 'opis',    width: 60, get: (a) => txt(a.description) },
      { key: 'Zdjęcia', id: 'zdjecia', width: 8,  get: (a) => countImages(a.media) },
    ],
    rows: (r) => list(r.actions),
  },
  {
    sheet: 'Części',
    id: 'czesci',
    types: ['service'],
    columns: [
      { key: 'Nr',            id: 'nr',            width: 6,  get: (p, i) => i + 1 },
      { key: 'Element',       id: 'element',       width: 30, get: (p) => txt(p.name) },
      { key: 'Nr katalogowy', id: 'nr_katalogowy', width: 20, get: (p) => txt(p.catalogNo) },
      { key: 'Szt.',          id: 'szt',           width: 7,  get: (p) => (isNum(p.qty) ? Number(p.qty) : '') },
      { key: 'Priorytet',     id: 'priorytet',     width: 13, get: (p) => label(PART_PRIORITY_LABELS, p.priority) },
      { key: 'priorytet_key', id: 'priorytet_key', width: 13, get: (p) => txt(p.priority) },
      { key: 'Komentarz',     id: 'komentarz',     width: 40, get: (p) => txt(p.comment) },
      { key: 'Zdjęcia',       id: 'zdjecia',       width: 8,  get: (p) => countImages(p.media) },
    ],
    rows: (r) => list(r.parts),
  },
  {
    sheet: 'Testy',
    id: 'testy',
    types: ['satfat'],
    columns: [
      { key: 'Nr',         id: 'nr',         width: 6,  get: (t, i) => i + 1 },
      { key: 'Opis',       id: 'opis',       width: 45, get: (t) => txt(t.description) },
      { key: 'Kryterium',  id: 'kryterium',  width: 35, get: (t) => txt(t.criterion) },
      { key: 'Wynik',      id: 'wynik',      width: 14, get: (t) => label(TEST_STATUS_LABELS, t.status) },
      { key: 'wynik_key',  id: 'wynik_key',  width: 12, get: (t) => txt(t.status) },
      { key: 'Uwagi',      id: 'uwagi',      width: 35, get: (t) => txt(t.notes) },
      { key: 'Zdjęcia',    id: 'zdjecia',    width: 8,  get: (t) => countImages(t.media) },
    ],
    rows: (r) => list(r.tests),
  },
  {
    sheet: 'Usterki',
    id: 'usterki',
    types: ['satfat'],
    columns: [
      { key: 'Nr',            id: 'nr',            width: 6,  get: (p, i) => i + 1 },
      { key: 'Opis',          id: 'opis',          width: 50, get: (p) => txt(p.description) },
      { key: 'Priorytet',     id: 'priorytet',     width: 13, get: (p) => label(PUNCH_PRIORITY_LABELS, p.priority) },
      { key: 'priorytet_key', id: 'priorytet_key', width: 13, get: (p) => txt(p.priority) },
      { key: 'Uwagi',         id: 'uwagi',         width: 35, get: (p) => txt(p.notes) },
      { key: 'Zdjęcia',       id: 'zdjecia',       width: 8,  get: (p) => countImages(p.media) },
    ],
    rows: (r) => list(r.punchlist),
  },
  {
    sheet: 'Punkty prototypu',
    id: 'punkty_prototypu',
    types: ['prototype'],
    columns: [
      { key: 'Nr',         id: 'nr',         width: 6,  get: (p, i) => i + 1 },
      { key: 'Opis',       id: 'opis',       width: 50, get: (p) => txt(p.description) },
      { key: 'Wynik',      id: 'wynik',      width: 12, get: (p) => label(POINT_RESULT_LABELS, p.result) },
      { key: 'wynik_key',  id: 'wynik_key',  width: 11, get: (p) => txt(p.result) },
      { key: 'Komentarz',  id: 'komentarz',  width: 40, get: (p) => txt(p.comment) },
      { key: 'Zdjęcia',    id: 'zdjecia',    width: 8,  get: (p) => countImages(p.media) },
    ],
    rows: (r) => list(r.points),
  },
  {
    // Parametry testu prototypu — pary klucz/wartość. To najbliżej realnych
    // danych eksperymentalnych: zestawione z wynikami punktów pokazują, który
    // parametr chodzi w parze z NOK.
    sheet: 'Parametry',
    id: 'parametry',
    types: ['prototype'],
    columns: [
      { key: 'Podzespół', id: 'podzespol', width: 20, get: (p, i, r) => txt(r.info?.component) },
      { key: 'Iteracja',  id: 'iteracja',  width: 9,  get: (p, i, r) => Number(r.info?.iteration) || 1 },
      { key: 'Parametr',  id: 'parametr',  width: 26, get: (p) => txt(p.key) },
      { key: 'Wartość',   id: 'wartosc',   width: 20, get: (p) => txt(p.value) },
    ],
    rows: (r) => list(r.conditions?.params),
  },
  {
    // Wszystkie wpisy opisowe w jednym miejscu — jedna kolumna „Źródło"
    // zastępuje osobne arkusze na obserwacje, rekomendacje i wnioski.
    sheet: 'Notatki',
    id: 'notatki',
    types: null,   // każdy typ, który ma jakiekolwiek wpisy
    columns: [
      { key: 'Typ',     id: 'typ',     width: 14, get: (n, i, r) => TYPE_SHORT[r.type] || r.type },
      { key: 'Źródło',  id: 'zrodlo',  width: 16, get: (n) => n.source },
      { key: 'Nr',      id: 'nr',      width: 6,  get: (n) => n.index },
      { key: 'Treść',   id: 'tresc',   width: 70, get: (n) => txt(n.text) },
      { key: 'Zdjęcia', id: 'zdjecia', width: 8,  get: (n) => countImages(n.media) },
    ],
    rows: (r) => {
      const out = []
      const push = (arr, source) => {
        list(arr).forEach((o, i) => {
          if (txt(o?.text)) out.push({ source, index: i + 1, text: o.text, media: o.media })
        })
      }
      if (r.type === 'service') {
        push(r.observations, 'Obserwacja')
        push(r.recommendations, 'Rekomendacja')
      } else if (r.type === 'commissioning') {
        push(r.observations, 'Obserwacja')
        push(r.conclusions, 'Wniosek')
      } else if (r.type === 'satfat') {
        push(r.conclusions, 'Wniosek')
      } else if (r.type === 'lesson') {
        push(r.lessons, 'Wniosek z ticketu')
      } else if (r.type === 'prototype' && txt(r.observations)) {
        // Prototyp trzyma obserwacje jako jeden blok tekstu, nie listę rekordów.
        out.push({ source: 'Obserwacja', index: 1, text: r.observations, media: r.observationsMedia })
      }
      return out
    },
  },
]

// ---------- Zbudowanie zbioru danych ----------
// Zwraca { fact, children: {sheetId: rows[]}, perReport } — `perReport` służy
// JSONL-owi (dzieci zagnieżdżone w raporcie), reszta arkuszom XLSX.
function buildDataset(reports) {
  const sorted = [...reports].sort((a, b) => {
    const da = txt(a.header?.date) || txt(a.createdAt).slice(0, 10)
    const db = txt(b.header?.date) || txt(b.createdAt).slice(0, 10)
    return da < db ? 1 : da > db ? -1 : 0   // najnowsze na górze
  })

  const fact = []
  const children = {}
  const perReport = []
  for (const t of CHILD_TABLES) children[t.id] = []

  for (const r of sorted) {
    const m = measures(r)
    const factRowXlsx = {}
    const factRowJson = {}
    for (const c of FACT_COLUMNS) {
      const v = c.get(r, m)
      factRowXlsx[c.key] = v
      factRowJson[c.id] = v
    }
    fact.push(factRowXlsx)

    const nested = { ...factRowJson }
    for (const t of CHILD_TABLES) {
      if (t.types && !t.types.includes(r.type)) continue
      const items = t.rows(r)
      if (!items.length) continue
      const jsonRows = []
      items.forEach((item, i) => {
        const xlsxRow = {}
        const jsonRow = {}
        for (const c of CHILD_KEYS) { xlsxRow[c.key] = c.get(r) }
        for (const c of t.columns) {
          const v = c.get(item, i, r)
          xlsxRow[c.key] = v
          jsonRow[c.id] = v
        }
        children[t.id].push(xlsxRow)
        jsonRows.push(jsonRow)
      })
      nested[t.id] = jsonRows
    }
    perReport.push(nested)
  }

  return { fact, children, perReport, count: sorted.length }
}

// Znacznik czasu w nazwie pliku: data + godzina, żeby dwa eksporty tego samego
// dnia nie nadpisywały się w Pobranych (i żeby dało się je ułożyć w szereg).
function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

function emptyError() {
  const err = new Error('Brak raportów do eksportu')
  err.code = 'EMPTY'
  return err
}

// ---------- XLSX: wielozakładkowy arkusz dla człowieka ----------
export async function buildAnalyticsXlsx(reports) {
  const data = buildDataset(reports || [])
  if (data.count === 0) throw emptyError()

  // Interop CJS/ESM: xlsx bywa udostępniany jako namespace ALBO pod .default.
  const mod = await import('xlsx')
  const XLSX = mod.utils ? mod : (mod.default || mod)

  const wb = XLSX.utils.book_new()
  const addSheet = (name, rows, columns) => {
    const header = columns.map((c) => c.key)
    const ws = XLSX.utils.json_to_sheet(rows, { header })
    ws['!cols'] = columns.map((c) => ({ wch: c.width }))
    if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] }
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  // Arkusz „Info" jako pierwszy — czytelnik od razu wie, czym i kiedy policzone
  // oraz jakie konwencje obowiązują w pozostałych zakładkach.
  const infoRows = [
    { Pole: 'Wyeksportowano', Wartość: new Date().toISOString() },
    { Pole: 'Wersja aplikacji', Wartość: APP_VERSION },
    { Pole: 'Wersja schematu danych', Wartość: SCHEMA_VERSION },
    { Pole: 'Raportów', Wartość: data.count },
  ]
  for (const t of CHILD_TABLES) {
    infoRows.push({ Pole: `Wiersze: ${t.sheet}`, Wartość: data.children[t.id].length })
  }
  infoRows.push(
    { Pole: '', Wartość: '' },
    { Pole: 'Konwencja: czas', Wartość: 'Wszystkie czasy trwania w MINUTACH (zatrzymania też w sekundach) — liczby, nie tekst.' },
    { Pole: 'Konwencja: puste', Wartość: 'Pusta komórka = nie dotyczy tego typu raportu. To NIE jest zero.' },
    { Pole: 'Konwencja: klucze', Wartość: 'Kolumny *_key trzymają surową wartość z danych; obok jest etykieta do czytania.' },
    { Pole: 'Konwencja: daty', Wartość: 'Data = YYYY-MM-DD. Znaczniki czasu (Utworzono, Start sesji) = ISO 8601 z czasem.' },
    { Pole: 'Dostępność [%]', Wartość: '(czas sesji − czas zatrzymań) / czas sesji. Puste, gdy sesja nie została zamknięta.' },
    { Pole: 'MTBF / MTTR [min]', Wartość: 'MTBF = czas sesji / liczba zatrzymań. MTTR = czas zatrzymań / liczba zatrzymań.' },
    { Pole: 'FPY [%]', Wartość: 'Testy zaliczone / (wszystkie − N/A). Testy „N/A" nie wchodzą do mianownika.' },
    { Pole: 'Powód vs powod_slownik', Wartość: 'Powód = z „Inne" podstawiony wpisany tekst. powod_slownik = surowa wartość ze słownika (mierz udział „Inne").' },
  )
  addSheet('Info', infoRows, [{ key: 'Pole', width: 26 }, { key: 'Wartość', width: 105 }])

  addSheet('Raporty', data.fact, FACT_COLUMNS)
  for (const t of CHILD_TABLES) {
    const rows = data.children[t.id]
    if (rows.length === 0) continue   // nie zaśmiecamy pustymi zakładkami
    addSheet(t.sheet, rows, [...CHILD_KEYS, ...t.columns])
  }

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  return { blob, filename: `analiza-raportow_${stamp()}.xlsx`, count: data.count }
}

// ---------- JSONL: jedna linia = jeden raport (dla maszyny) ----------
// Klucze ASCII snake_case, dzieci zagnieżdżone w raporcie. Każda linia wiezie
// wersję apki i datę eksportu, więc jest samoopisująca się nawet po sklejeniu
// wielu plików z różnych miesięcy w jeden zbiór.
export async function buildAnalyticsJsonl(reports) {
  const data = buildDataset(reports || [])
  if (data.count === 0) throw emptyError()

  const exportedAt = new Date().toISOString()
  const lines = data.perReport.map((row) => JSON.stringify({
    ...row,
    wersja_apki: APP_VERSION,
    schemat_apki: SCHEMA_VERSION,
    wyeksportowano: exportedAt,
  }))
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson;charset=utf-8' })
  return { blob, filename: `analiza-raportow_${stamp()}.jsonl`, count: data.count }
}
