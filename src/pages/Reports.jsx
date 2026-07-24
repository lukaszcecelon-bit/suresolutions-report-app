import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAll, remove, upsert, cloneReport } from '../utils/storage.js'
import { buildCommissioningPdf, buildServicePdf, buildPrototypePdf, buildSatFatPdf, buildComplaintPdf, buildLessonPdf } from '../utils/pdfGenerator.js'
import { buildLessonRegisterXlsx } from '../utils/registerExport.js'
import { LESSON_SEVERITIES } from '../utils/settings.js'
import { TYPE_LABELS, TYPE_ICONS, typeCategory, CATEGORY_ACCENT } from '../utils/reportMeta.js'
import { exportAllReportsPackage, shareOrDownload, shareFileOrDownload, downloadBlob, canShareFiles, backupAllReports } from '../utils/syncPackage.js'
import { useToast, useConfirm } from '../components/common/Toast.jsx'
import PackageImportDialog from '../components/common/PackageImportDialog.jsx'
import EmptyState from '../components/common/EmptyState.jsx'

// Zakładka 🗂 RAPORTY (v0.42) — pełna lista przeniesiona ze strony głównej
// (Start został lekkim pulpitem). Tu mieszka wszystko „archiwalne":
// wyszukiwarka, segment stref (Wszystkie | Dla klienta | Wewnętrzne),
// filtry typu/statusu, podfiltry rejestru lekcji, multi-select z akcjami
// zbiorczymi, import paczek .suresync, backup i eksport rejestru do XLSX.

const TYPE_FILTER_ITEMS = [
  { key: 'commissioning', label: '▶ Uruchomienie' },
  { key: 'service',       label: '🔧 Serwis' },
  { key: 'satfat',        label: '📋 SAT/FAT' },
  { key: 'prototype',     label: '🧪 Prototyp' },
  { key: 'lesson',        label: '🎓 Lekcja' },
  { key: 'complaint',     label: '🚩 Reklamacja' },
]

const STATUS_FILTER_ITEMS = [
  { key: 'draft',     label: 'Robocze' },
  { key: 'completed', label: 'Ukończone' },
]

// Segment stref — nadrzędny podział listy (kolory jak w wyborze typu).
const SEGMENTS = [
  { key: 'all',      label: 'Wszystkie' },
  { key: 'client',   label: '🏢 Dla klienta' },
  { key: 'internal', label: '🔒 Wewnętrzne' },
]

// Polish-aware case-insensitive substring match (strips diacritics on both sides)
function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

function getSearchableText(r) {
  const parts = []
  const push = (v) => { if (v && typeof v === 'string') parts.push(v) }
  // Listy rekordów {text,media} (obserwacje/rekomendacje/wnioski) — indeksuj teksty.
  const pushList = (arr) => { if (Array.isArray(arr)) for (const o of arr) push(o?.text) }
  const h = r.header || {}
  push(h.reportNumber); push(h.projectName); push(h.machineName); push(h.author)
  if (r.type === 'service') {
    push(r.visit?.client); push(r.visit?.location)
    push(r.receivedBy); push(r.role)
    for (const a of (r.actions || [])) { push(a.description) }
    for (const p of (r.parts || [])) { push(p.name); push(p.catalogNo); push(p.comment) }
    pushList(r.observations)      // nowy model (lista rekordów)
    pushList(r.recommendations)   // nowy model (lista rekordów)
    if (typeof r.observations === 'string') push(r.observations) // wsteczna zgodność
  } else if (r.type === 'complaint') {
    push(r.partNo); push(r.defectCategory); push(r.description)
  } else if (r.type === 'prototype') {
    push(r.info?.component); push(r.info?.goal)
    push(r.observations); push(r.decisionNotes); push(r.conditions?.setup)
    for (const p of (r.conditions?.params || [])) { push(p.key); push(p.value) }
    for (const p of (r.points || [])) { push(p.description); push(p.comment) }
  } else if (r.type === 'commissioning') {
    pushList(r.observations); pushList(r.conclusions)   // nowy model (listy rekordów)
    for (const s of (r.stops || [])) { push(s.comment); push(s.customReason); push(s.reason) }
  } else if (r.type === 'satfat') {
    push(r.info?.client); push(r.info?.location); push(r.info?.referenceDoc)
    pushList(r.conclusions)   // nowy model (lista rekordów)
    for (const t of (r.tests || [])) { push(t.description); push(t.criterion); push(t.notes) }
    for (const p of (r.punchlist || [])) { push(p.description); push(p.notes) }
    for (const pp of (r.participants?.client || [])) { push(pp.name); push(pp.role) }
    for (const pp of (r.participants?.vendor || [])) { push(pp.name); push(pp.role) }
  } else if (r.type === 'lesson') {
    push(r.stage); push(r.category); push(r.drawingNo); push(r.problem); push(r.impact)
    pushList(r.lessons)       // wnioski (lista rekordów)
  }
  return normalize(parts.join(' '))
}

export default function Reports({ navigate }) {
  const [reports, setReports] = useState([])
  const [busyId, setBusyId] = useState(null)
  // `queryInput` = co user właśnie pisze (controlled input bez opóźnienia)
  // `query` = wartość użyta do filtrowania (debounced 150ms)
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [segment, setSegment] = useState('all')
  const [typeFilter, setTypeFilter] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState(new Set())
  // Podfiltry rejestru lekcji (kategoria + istotność) — widoczne tylko gdy
  // aktywny filtr typu „Lekcja"; pozwalają przeglądać rejestr wprost w apce.
  const [categoryFilter, setCategoryFilter] = useState(new Set())
  const [severityFilter, setSeverityFilter] = useState(new Set())
  const [importFile, setImportFile] = useState(null)        // wybrany .suresync do importu (modal)
  const [backupBusy, setBackupBusy] = useState(false)
  const [xlsxBusy, setXlsxBusy] = useState(false)           // eksport rejestru lekcji do XLSX
  // Tryb zaznaczania (multi-select): checkboxy na kartach + pasek akcji
  // zbiorczych (eksport zaznaczonych / usuń zaznaczone) na dole.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  // Karta listy: które menu ⋯ (Duplikuj/Usuń) jest otwarte
  const [openMenuId, setOpenMenuId] = useState(null)
  // Menu ⋯ w nagłówku (archiwum) + zwijany panel filtrów (v0.51)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const importInput = useRef(null)

  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    setReports(loadAll())
  }, [])

  // Debounce search input → query (150ms idle).
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 150)
    return () => clearTimeout(t)
  }, [queryInput])

  const refresh = () => setReports(loadAll())

  // Sync — import paczki przez file picker.
  const handleImportClick = () => importInput.current?.click()
  const handleImportFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    // Reset value żeby user mógł wybrać ten sam plik ponownie (np. po anulowaniu)
    e.target.value = ''
  }
  const handleImported = (result) => {
    refresh()
    if (result.imported.length > 0) {
      toast.success(`Zaimportowano ${result.imported.length} raport(ów)`)
    }
  }

  // Backup wszystkich raportów do jednej paczki .suresync.
  const handleBackup = async () => {
    if (reports.length === 0) {
      toast.info('Brak raportów do backupu')
      return
    }
    setBackupBusy(true)
    try {
      // Wspólny helper — buduje paczkę, udostępnia/pobiera i stempluje znacznik
      // ostatniego backupu (napędza przypomnienie na pulpicie).
      await backupAllReports()
      toast.success('Backup gotowy')
    } catch (e) {
      toast.error('Błąd backupu: ' + (e.message || e))
    } finally {
      setBackupBusy(false)
    }
  }

  // Eksport REJESTRU lekcji projektowych do XLSX (jeden wiersz = jedna lekcja).
  // `subset` (opcjonalny) — eksport tylko z zaznaczonych raportów (multi-select);
  // brak = wszystkie raporty. buildLessonRegisterXlsx i tak bierze same lekcje.
  const handleExportRegister = async (subset) => {
    setXlsxBusy(true)
    try {
      const { blob, filename, count } = await buildLessonRegisterXlsx(subset || reports)
      await shareOrDownload(blob, filename, `Rejestr lekcji projektowych (${count})`)
      toast.success(`Rejestr gotowy — ${count} ${count === 1 ? 'lekcja' : count < 5 ? 'lekcje' : 'lekcji'}`)
    } catch (e) {
      if (e.code === 'EMPTY') toast.info(subset ? 'Wśród zaznaczonych nie ma lekcji projektowych' : 'Brak lekcji projektowych do eksportu')
      else toast.error('Błąd eksportu: ' + (e.message || e))
    } finally {
      setXlsxBusy(false)
    }
  }

  const handleDelete = async (r) => {
    const ok = await confirm(`Usunąć raport „${r.header?.reportNumber || 'bez numeru'}"? Tej operacji nie można cofnąć.`, {
      title: 'Usunięcie raportu', variant: 'danger', confirmLabel: 'Usuń'
    })
    if (!ok) return
    remove(r.id)
    refresh()
    toast.success('Raport usunięty')
  }

  // Szybka akcja z listy = sam PDF (lekki, odbiorca otwiera od razu — zgodnie
  // z filozofią v0.33). Pełną paczkę ZIP z oryginałami zdjęć robi się z wnętrza
  // raportu (pasek akcji).
  const PDF_BUILDERS = {
    commissioning: buildCommissioningPdf,
    service: buildServicePdf,
    prototype: buildPrototypePdf,
    satfat: buildSatFatPdf,
    complaint: buildComplaintPdf,
    lesson: buildLessonPdf,
  }

  const handlePdf = async (r) => {
    const build = PDF_BUILDERS[r.type]
    if (!build) { toast.info('Pobieranie dla tego typu raportu zostanie dodane w kolejnej fazie.'); return }
    setBusyId(r.id)
    try {
      const { blob, filename } = await build(r)
      // Telefon → systemowe okno (Teams/Mail), desktop → pobranie pliku.
      if (canShareFiles()) {
        const ok = await shareFileOrDownload(blob, filename, 'application/pdf')
        if (ok) toast.success('Udostępniono')
      } else {
        downloadBlob(blob, filename)
        toast.success('PDF pobrany')
      }
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setBusyId(null)
    }
  }

  // Nazwy tras == klucze typów (tak zarejestrowane w App.jsx).
  const handleOpen = (r) => navigate(`${r.type}/${r.id}`)

  // ---- Multi-select: akcje zbiorcze ----
  const toggleSelectMode = () => {
    setSelectMode((m) => !m)
    setSelectedIds(new Set())
  }
  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAllVisible = (list) => {
    setSelectedIds((prev) => {
      // Jeśli wszystkie widoczne już zaznaczone → odznacz; inaczej zaznacz wszystkie.
      const allSelected = list.every((r) => prev.has(r.id))
      return allSelected ? new Set() : new Set(list.map((r) => r.id))
    })
  }
  const handleBulkExport = async (list) => {
    const sel = list.filter((r) => selectedIds.has(r.id))
    if (sel.length === 0) return
    setBackupBusy(true)
    try {
      const blob = await exportAllReportsPackage(sel)
      const date = new Date().toISOString().slice(0, 10)
      await shareOrDownload(blob, `wybrane-${sel.length}_raporty-sure_${date}.zip`, `Raporty SURE (${sel.length})`)
      toast.success(`Paczka z ${sel.length} raportami gotowa`)
    } catch (e) {
      toast.error('Błąd eksportu: ' + (e.message || e))
    } finally {
      setBackupBusy(false)
    }
  }
  const handleBulkDelete = async () => {
    const n = selectedIds.size
    if (n === 0) return
    const ok = await confirm(`Usunąć ${n} zaznaczonych raportów (wraz ze zdjęciami)? Tej operacji nie można cofnąć.`, {
      title: 'Usuwanie zbiorcze', variant: 'danger', confirmLabel: `Usuń (${n})`,
    })
    if (!ok) return
    for (const id of selectedIds) remove(id)
    setSelectedIds(new Set())
    setSelectMode(false)
    refresh()
    toast.success(`Usunięto ${n} raportów`)
  }

  const handleClone = (r) => {
    const fresh = cloneReport(r)
    upsert(fresh)
    refresh()
    toast.success('Utworzono kopię — rozpocznij edycję nowego raportu')
    navigate(`${fresh.type}/${fresh.id}`)
  }

  // STAŁA kolejność: wg daty UTWORZENIA (najnowsze na górze), NIE wg updatedAt —
  // pozycja raportu nie skacze po edycji (decyzja z v0.27).
  const sorted = useMemo(() => [...reports].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    if (tb !== ta) return tb - ta
    // Deterministyczny tiebreak gdy createdAt identyczne (np. import paczki)
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
  }), [reports])

  // Liczniki segmentów (do etykiet w przełączniku).
  const segCounts = useMemo(() => {
    let client = 0
    let internal = 0
    for (const r of reports) (typeCategory(r.type) === 'client' ? client++ : internal++)
    return { all: reports.length, client, internal }
  }, [reports])

  // Zmiana segmentu odfiltrowuje chipy typów spoza strefy — usuń też ich
  // zaznaczenia, żeby nie zostały „ukryte" aktywne filtry.
  useEffect(() => {
    if (segment === 'all') return
    setTypeFilter((prev) => {
      const next = new Set([...prev].filter((k) => typeCategory(k) === segment))
      return next.size === prev.size ? prev : next
    })
  }, [segment])

  // Kategorie faktycznie występujące w lekcjach (do chipów rejestru).
  const lessonFilterActive = typeFilter.has('lesson')
  const presentCategories = useMemo(() => {
    const set = new Set()
    for (const r of reports) if (r.type === 'lesson' && r.category) set.add(r.category)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'))
  }, [reports])

  // Gdy wyłączysz filtr „Lekcja", wyczyść podfiltry rejestru.
  useEffect(() => {
    if (!lessonFilterActive) {
      setCategoryFilter((s) => (s.size ? new Set() : s))
      setSeverityFilter((s) => (s.size ? new Set() : s))
    }
  }, [lessonFilterActive])

  // Chipy typów zawężone do aktywnej strefy.
  const visibleTypeItems = useMemo(() => (
    segment === 'all' ? TYPE_FILTER_ITEMS : TYPE_FILTER_ITEMS.filter((t) => typeCategory(t.key) === segment)
  ), [segment])

  // Apply segment + search + filters
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return sorted.filter((r) => {
      if (segment !== 'all' && typeCategory(r.type) !== segment) return false
      if (typeFilter.size > 0 && !typeFilter.has(r.type)) return false
      const isCompleted = r.status === 'completed'
      const statusKey = isCompleted ? 'completed' : 'draft'
      if (statusFilter.size > 0 && !statusFilter.has(statusKey)) return false
      // Podfiltry rejestru — zawężają WYŁĄCZNIE do pasujących lekcji.
      if (categoryFilter.size > 0 && !(r.type === 'lesson' && categoryFilter.has(r.category))) return false
      if (severityFilter.size > 0 && !(r.type === 'lesson' && severityFilter.has(r.severity))) return false
      if (q && !getSearchableText(r).includes(q)) return false
      return true
    })
  }, [sorted, segment, query, typeFilter, statusFilter, categoryFilter, severityFilter])

  const toggleFilter = (set, setter, key) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key); else next.add(key)
    setter(next)
  }

  // Reset wszystkich filtrów (segment + wyszukiwarka + typ + status + rejestr).
  const clearAllFilters = () => {
    setSegment('all')
    setQueryInput(''); setQuery('')
    setTypeFilter(new Set()); setStatusFilter(new Set())
    setCategoryFilter(new Set()); setSeverityFilter(new Set())
  }

  const fmtUpdated = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return `dziś ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return d.toISOString().slice(0, 10)
  }

  const hasFiltersActive = query.trim() || segment !== 'all' || typeFilter.size > 0 || statusFilter.size > 0 || categoryFilter.size > 0 || severityFilter.size > 0
  // Licznik na przycisku „Filtry (N)" — liczy tylko to, co jest SCHOWANE w
  // panelu (szukajka i segment są widoczne na stałe, więc się nie liczą).
  const activeFilterCount = typeFilter.size + statusFilter.size + categoryFilter.size + severityFilter.size

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-sure-dark dark:text-gray-100">Raporty</h1>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate('new')}
            className="btn-sm bg-sure-blue text-white hover:bg-sure-blue/90"
          >
            + Nowy
          </button>
          {/* Narzędzia archiwum (import / backup / rejestr / zaznaczanie) —
              używane raz w miesiącu, więc nie zajmują stałych wierszy nad listą. */}
          <div className="relative">
            <button
              onClick={() => setToolsOpen((o) => !o)}
              className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-10"
              aria-label="Narzędzia archiwum"
              aria-haspopup="menu"
              aria-expanded={toolsOpen}
            >
              ⋯
            </button>
            {toolsOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setToolsOpen(false)} />
                <div role="menu" className="absolute right-0 top-full mt-1 z-30 min-w-[232px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                  {sorted.length > 0 && (
                    <button
                      role="menuitem"
                      className="w-full text-left px-3 py-2.5 text-sm text-sure-dark dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => { setToolsOpen(false); toggleSelectMode() }}
                    >
                      {selectMode ? '✕ Zakończ zaznaczanie' : '☑ Zaznacz wiele'}
                    </button>
                  )}
                  <button
                    role="menuitem"
                    className="w-full text-left px-3 py-2.5 text-sm text-sure-dark dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => { setToolsOpen(false); handleImportClick() }}
                  >
                    📥 Importuj raport z paczki
                  </button>
                  <button
                    role="menuitem"
                    disabled={backupBusy || reports.length === 0}
                    className="w-full text-left px-3 py-2.5 text-sm text-sure-dark dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                    onClick={() => { setToolsOpen(false); handleBackup() }}
                  >
                    {backupBusy ? '⏳ Pakowanie…' : '💾 Backup wszystkich raportów'}
                  </button>
                  {reports.some((r) => r.type === 'lesson') && (
                    <button
                      role="menuitem"
                      disabled={xlsxBusy}
                      className="w-full text-left px-3 py-2.5 text-sm text-sure-dark dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                      onClick={() => { setToolsOpen(false); handleExportRegister() }}
                    >
                      {xlsxBusy ? '⏳ Tworzenie arkusza…' : '📊 Rejestr lekcji → Excel'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <input
          ref={importInput}
          type="file"
          accept=".suresync,.zip,application/zip"
          onChange={handleImportFileChange}
          className="hidden"
        />
      </div>

      <section>
        {/* Segment stref — nadrzędny podział listy */}
        {sorted.length > 0 && (
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-3">
            {SEGMENTS.map((s) => {
              const active = segment === s.key
              const activeCls = s.key === 'client'
                ? 'bg-sure-blue text-white shadow-sm'
                : s.key === 'internal'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-600 text-sure-dark dark:text-gray-100 shadow-sm'
              return (
                <button
                  key={s.key}
                  onClick={() => setSegment(s.key)}
                  className={
                    'py-2 px-1 rounded-lg text-xs sm:text-sm font-medium transition ' +
                    (active ? activeCls : 'text-gray-600 dark:text-gray-300 hover:text-sure-dark dark:hover:text-gray-100')
                  }
                >
                  {s.label} <span className="opacity-70 tabular-nums">· {segCounts[s.key]}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Search + filters — only show if there's anything to filter */}
        {sorted.length > 0 && (
          <div className="space-y-2 mb-4">
            <div className="relative">
              <input
                type="search"
                inputMode="search"
                aria-label="Szukaj raportów"
                placeholder="🔍 Szukaj (numer, projekt, klient, treść…)"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                className="field-input pr-12"
              />
              {queryInput && (
                <button
                  type="button"
                  onClick={() => { setQueryInput(''); setQuery('') }}
                  className="absolute top-1/2 -translate-y-1/2 right-1.5 w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-sm flex items-center justify-center"
                  aria-label="Wyczyść wyszukiwanie"
                >✕</button>
              )}
            </div>

            {/* Filtry ZWINIĘTE — rozwijasz tylko gdy naprawdę zawężasz listę.
                Licznik pokazuje, ile filtrów działa, więc nic nie „filtruje w
                ukryciu". Obok licznik wyników, żeby efekt był od razu widać. */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltersOpen((o) => !o)}
                aria-expanded={filtersOpen}
                className={
                  'text-xs px-3 py-2 min-h-[38px] rounded-full font-medium transition border ' +
                  (activeFilterCount > 0
                    ? 'bg-sure-blue text-white border-transparent'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500')
                }
              >
                Filtry{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} {filtersOpen ? '▴' : '▾'}
              </button>
              {hasFiltersActive && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-sure-blue px-1 py-1.5 hover:underline"
                >
                  Wyczyść
                </button>
              )}
              <div className="ml-auto text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {filtered.length === sorted.length
                  ? `${sorted.length} ${sorted.length === 1 ? 'raport' : sorted.length < 5 ? 'raporty' : 'raportów'}`
                  : `${filtered.length} z ${sorted.length}`}
              </div>
            </div>

            {filtersOpen && (<>
            <div className="flex flex-wrap gap-1.5">
              {visibleTypeItems.map((t) => {
                const active = typeFilter.has(t.key)
                const cat = typeCategory(t.key)
                const activeCls = cat === 'client'
                  ? 'bg-sure-blue text-white border-transparent'
                  : 'bg-violet-600 text-white border-transparent'
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleFilter(typeFilter, setTypeFilter, t.key)}
                    className={
                      'text-xs px-3 py-2 min-h-[38px] rounded-full font-medium transition border ' +
                      (active
                        ? activeCls
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500')
                    }
                  >
                    {t.label}
                  </button>
                )
              })}
              <span className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-1" />
              {STATUS_FILTER_ITEMS.map((s) => {
                const active = statusFilter.has(s.key)
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleFilter(statusFilter, setStatusFilter, s.key)}
                    className={
                      'text-xs px-3 py-1.5 rounded-full font-medium transition border ' +
                      (active
                        ? (s.key === 'completed'
                            ? 'bg-emerald-600 text-white border-transparent'
                            : 'bg-amber-500 text-white border-transparent')
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500')
                    }
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>

            {/* Podfiltry rejestru lekcji — widoczne tylko przy aktywnym filtrze
                „Lekcja". Zamieniają listę w przeglądarkę rejestru: kategoria +
                istotność. Kategorie brane z danych (te faktycznie użyte). */}
            {lessonFilterActive && (
              <div className="flex flex-wrap gap-1.5 items-center pl-1 border-l-2 border-sure-blue/30">
                <span className="text-xs text-gray-500 dark:text-gray-400 pl-1.5">🎓 Rejestr:</span>
                {presentCategories.map((cat) => {
                  const active = categoryFilter.has(cat)
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleFilter(categoryFilter, setCategoryFilter, cat)}
                      className={
                        'text-xs px-3 py-1.5 rounded-full font-medium transition border ' +
                        (active
                          ? 'bg-sure-blue text-white border-transparent'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500')
                      }
                    >
                      {cat}
                    </button>
                  )
                })}
                {presentCategories.length > 0 && <span className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-1" />}
                {LESSON_SEVERITIES.map((s) => {
                  const active = severityFilter.has(s.key)
                  const activeCls = s.key === 'critical'
                    ? 'bg-red-600 text-white border-transparent'
                    : s.key === 'major'
                      ? 'bg-amber-500 text-white border-transparent'
                      : 'bg-gray-500 text-white border-transparent'
                  return (
                    <button
                      key={s.key}
                      onClick={() => toggleFilter(severityFilter, setSeverityFilter, s.key)}
                      className={
                        'text-xs px-3 py-1.5 rounded-full font-medium transition border ' +
                        (active
                          ? activeCls
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500')
                      }
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            )}

            </>)}
          </div>
        )}

        {sorted.length === 0 ? (
          <EmptyState icon="🗂" title="Brak zapisanych raportów" hint="Kliknij „+ Nowy” powyżej, aby zacząć.">
            <button onClick={() => navigate('help')} className="text-sure-blue underline">zobacz jak to działa</button>
          </EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState icon="🔍" title="Nic nie pasuje do filtrów">
            <button onClick={clearAllFilters} className="text-sure-blue underline">wyczyść filtry</button>
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const completed = r.status === 'completed'
              const isBusy = busyId === r.id
              const isSelected = selectedIds.has(r.id)
              const accent = CATEGORY_ACCENT[typeCategory(r.type)] || ''
              return (
                <div
                  key={r.id}
                  onClick={selectMode ? () => toggleSelected(r.id) : undefined}
                  className={
                    'card flex flex-col sm:flex-row sm:items-center gap-3 transition ' + accent + ' ' +
                    (selectMode ? 'cursor-pointer select-none ' : '') +
                    (isSelected ? 'ring-2 ring-sure-blue ' : '')
                  }
                >
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(r.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-5 h-5 shrink-0 accent-[#3D70B2] self-start sm:self-center"
                      aria-label="Zaznacz raport"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                      <span className="text-lg leading-none">{TYPE_ICONS[r.type] || '📄'}</span>
                      <span className="truncate">{TYPE_LABELS[r.type] || r.type}</span>
                      <span className={
                        'ml-auto text-xs px-2 py-0.5 rounded-full border ' +
                        (completed
                          ? 'border-emerald-400 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-300 dark:bg-emerald-900/30'
                          : 'border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-500/50 dark:text-amber-300 dark:bg-amber-900/30')
                      }>
                        {completed ? '🔒 Ukończony' : 'Roboczy'}
                      </span>
                    </div>
                    <div className="mt-1.5 font-semibold text-sure-dark dark:text-gray-100 truncate">
                      {r.header?.reportNumber || '(brak nr)'} · {r.header?.projectName || '(brak projektu)'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Maszyna: {r.header?.machineName || '—'} · Data: {r.header?.date || '—'} · Autor: {r.header?.author || '—'}
                    </div>
                    {r.updatedAt && (
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        Zmienione {fmtUpdated(r.updatedAt)}
                      </div>
                    )}
                  </div>
                  {!selectMode && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <button
                      className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
                      onClick={() => handleOpen(r)}
                    >
                      Otwórz
                    </button>
                    <button
                      className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
                      disabled={isBusy}
                      onClick={() => handlePdf(r)}
                    >
                      {isBusy ? '⏳…' : '📄 PDF'}
                    </button>
                    {/* Rzadsze/destrukcyjne akcje w menu ⋯ — „Usuń" nie sąsiaduje
                        już bezpośrednio z „Otwórz" (mniej przypadkowych tapnięć). */}
                    <div className="relative">
                      <button
                        className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-10"
                        onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                        aria-label="Więcej akcji"
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === r.id}
                      >
                        ⋯
                      </button>
                      {openMenuId === r.id && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
                          <div role="menu" className="absolute right-0 top-full mt-1 z-30 min-w-[168px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                            <button
                              role="menuitem"
                              className="w-full text-left px-3 py-2.5 text-sm text-sure-dark dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                              onClick={() => { setOpenMenuId(null); handleClone(r) }}
                            >
                              📋 Duplikuj jako szablon
                            </button>
                            <button
                              role="menuitem"
                              className="w-full text-left px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                              onClick={() => { setOpenMenuId(null); handleDelete(r) }}
                            >
                              🗑 Usuń raport
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pasek akcji zbiorczych (multi-select) — bottom-14 = NAD dolnym TabBarem */}
        {selectMode && filtered.length > 0 && (
          <div className="sticky bottom-14 z-20 mt-4 -mx-4 px-4 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-200 tabular-nums">
                <strong>{selectedIds.size}</strong> zazn.
              </span>
              <button
                onClick={() => selectAllVisible(filtered)}
                className="text-xs text-sure-blue px-2 py-1.5 hover:underline"
              >
                {filtered.every((r) => selectedIds.has(r.id)) ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
              </button>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => handleBulkExport(filtered)}
                  disabled={selectedIds.size === 0 || backupBusy}
                  className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 disabled:opacity-40"
                  title="Eksportuj zaznaczone raporty do jednej paczki"
                >
                  {backupBusy ? '⏳ Pakowanie…' : '📦 Eksportuj'}
                </button>
                <button
                  onClick={() => handleExportRegister(filtered.filter((r) => selectedIds.has(r.id)))}
                  disabled={selectedIds.size === 0 || xlsxBusy}
                  className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 disabled:opacity-40"
                  title="Eksportuj rejestr XLSX tylko z zaznaczonych lekcji"
                >
                  {xlsxBusy ? '⏳ Arkusz…' : '📊 Rejestr'}
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0}
                  className="btn-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                >
                  🗑 Usuń
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {importFile && (
        <PackageImportDialog
          file={importFile}
          onClose={() => setImportFile(null)}
          onImported={handleImported}
        />
      )}
    </div>
  )
}
