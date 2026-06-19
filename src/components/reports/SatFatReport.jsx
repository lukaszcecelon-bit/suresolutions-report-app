import { useMemo, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import SectionNav from '../common/SectionNav.jsx'
import EmptyState from '../common/EmptyState.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import SortableList from '../common/SortableList.jsx'
import ReportActionBar, { LockBanner } from '../common/ReportActionBar.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import SuggestInput from '../common/SuggestInput.jsx'
import { suggestClients, suggestLocations } from '../../utils/suggestions.js'
import { getById, newId } from '../../utils/storage.js'
import { useReportPage } from '../../utils/useReportPage.js'
import { generateSatFatPackage, generateSatFatPdf } from '../../utils/pdfGenerator.js'

// FAT (Factory Acceptance Test) vs SAT (Site Acceptance Test): identyczna
// struktura raportu, tylko inna etykieta i miejsce. Jeden komponent obsługuje oba,
// rozróżnienie idzie przez `report.testType`.
const TEST_TYPE_ITEMS = [
  { key: 'fat', label: 'FAT (u producenta)', icon: '🏭', activeClass: 'bg-sure-blue text-white border-transparent font-semibold' },
  { key: 'sat', label: 'SAT (na obiekcie)',  icon: '🏗️', activeClass: 'bg-sure-blue text-white border-transparent font-semibold' },
]

// Statusy wyniku pojedynczego testu — 4-state. Kolory dobrane mocno
// kontrastowo żeby w pełnym słońcu na placu też było widać który wybrałeś.
const TEST_STATUS_ITEMS = [
  { key: 'pass',        label: 'Zaliczony',    icon: '✓', activeClass: 'bg-emerald-600 text-white border-transparent font-semibold' },
  { key: 'fail',        label: 'Niezaliczony', icon: '✗', activeClass: 'bg-red-600 text-white border-transparent font-semibold' },
  { key: 'conditional', label: 'Warunkowo',    icon: '~', activeClass: 'bg-amber-500 text-white border-transparent font-semibold' },
  { key: 'na',          label: 'N/A',          icon: '—', activeClass: 'bg-gray-500 text-white border-transparent font-semibold' },
]

const PUNCHLIST_PRIORITY_ITEMS = [
  { key: 'critical', label: 'Krytyczne', icon: '🔴', activeClass: 'bg-red-100 text-red-700 border-red-400 font-semibold dark:bg-red-900/40 dark:text-red-200 dark:border-red-500/50' },
  { key: 'major',    label: 'Istotne',   icon: '🟡', activeClass: 'bg-amber-100 text-amber-800 border-amber-400 font-semibold dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-500/50' },
  { key: 'minor',    label: 'Drobne',    icon: '🟢', activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-400 font-semibold dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-500/50' },
]

const FINAL_STATUS_ITEMS = [
  { key: 'accepted',    label: 'Zaakceptowano',          icon: '✓', activeClass: 'bg-emerald-600 text-white border-transparent font-semibold' },
  { key: 'conditional', label: 'Zaakceptowano warunkowo', icon: '~', activeClass: 'bg-amber-500 text-white border-transparent font-semibold' },
  { key: 'rejected',    label: 'Odrzucono',              icon: '✗', activeClass: 'bg-red-600 text-white border-transparent font-semibold' },
]

const SECTIONS = [
  { id: 'sec-header', label: 'Nagłówek' },
  { id: 'sec-a',      label: 'A. Typ odbioru' },
  { id: 'sec-b',      label: 'B. Uczestnicy' },
  { id: 'sec-c',      label: 'C. Testy' },
  { id: 'sec-d',      label: 'D. Usterki' },
  { id: 'sec-e',      label: 'E. Status' },
  { id: 'sec-f',      label: 'F. Wnioski' },
  { id: 'sec-g',      label: 'G. Podpisy' },
  { id: 'sec-h',      label: 'H. Foto' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()

function defaultReport() {
  return {
    id: newId(),
    type: 'satfat',
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    header: {
      reportNumber: '',
      projectName: '',
      machineName: '',
      date: todayISO(),
      author: '',
    },
    testType: 'fat',
    info: {
      client: '',
      location: '',
      referenceDoc: '',
    },
    participants: {
      client: [],
      vendor: [],
    },
    tests: [],
    punchlist: [],
    finalStatus: 'accepted',
    conclusions: '',
    signatures: {
      clientName: '',
      clientDate: '',
      vendorName: '',
      vendorDate: '',
    },
    media: [],
  }
}

export default function SatFatReport({ navigate, reportId }) {
  const [report, setReport] = useState(() => {
    if (reportId) {
      const existing = getById(reportId)
      if (existing) return existing
    }
    return defaultReport()
  })

  // Wspólny szkielet strony raportu: auto-save, paczki, lock ukończonych.
  const page = useReportPage({ report, setReport, generatePackage: generateSatFatPackage, generatePdf: generateSatFatPdf })
  const { confirm, locked } = page

  // Memoizowane źródła autouzupełniania (zamiast pełnego parse localStorage co render).
  const clientSug = useMemo(() => suggestClients(), [])
  const locationSug = useMemo(() => suggestLocations(report.info.client), [report.info.client])

  const updateHeader = (h) => setReport((r) => ({ ...r, header: h }))
  const updateInfo = (k, v) => setReport((r) => ({ ...r, info: { ...r.info, [k]: v } }))
  const updateSignature = (k, v) => setReport((r) => ({ ...r, signatures: { ...r.signatures, [k]: v } }))

  // ---------- Participants (Klient / Wykonawca) ----------
  const addParticipant = (side) => {
    setReport((r) => ({
      ...r,
      participants: {
        ...r.participants,
        [side]: [...(r.participants[side] || []), { id: newId(), name: '', role: '' }],
      },
    }))
  }
  const updateParticipant = (side, id, patch) => {
    setReport((r) => ({
      ...r,
      participants: {
        ...r.participants,
        [side]: r.participants[side].map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    }))
  }
  const removeParticipant = async (side, id) => {
    if (!(await confirm('Usunąć tę osobę z listy?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({
      ...r,
      participants: {
        ...r.participants,
        [side]: r.participants[side].filter((p) => p.id !== id),
      },
    }))
  }

  // ---------- Testy (główna sekcja) ----------
  const addTest = () => {
    setReport((r) => ({
      ...r,
      tests: [...r.tests, {
        id: newId(),
        description: '',
        criterion: '',
        status: 'pass',  // domyślnie pass — większość testów się udaje, mniej kliknięć
        notes: '',
        media: [],
      }],
    }))
  }
  const updateTest = (id, patch) => {
    setReport((r) => ({ ...r, tests: r.tests.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  }
  const removeTest = async (id) => {
    if (!(await confirm('Usunąć ten test?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({ ...r, tests: r.tests.filter((t) => t.id !== id) }))
  }

  // ---------- Punchlist (usterki) ----------
  const addPunchItem = () => {
    setReport((r) => ({
      ...r,
      punchlist: [...r.punchlist, {
        id: newId(),
        description: '',
        priority: 'major',
        notes: '',
        media: [],
      }],
    }))
  }
  const updatePunchItem = (id, patch) => {
    setReport((r) => ({ ...r, punchlist: r.punchlist.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }
  const removePunchItem = async (id) => {
    if (!(await confirm('Usunąć tę usterkę?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({ ...r, punchlist: r.punchlist.filter((p) => p.id !== id) }))
  }

  // Quick stats for the C section header
  const passCount = report.tests.filter((t) => t.status === 'pass').length
  const failCount = report.tests.filter((t) => t.status === 'fail').length
  const condCount = report.tests.filter((t) => t.status === 'conditional').length

  const typeBadge = report.testType === 'fat'
    ? <span className="text-xs px-2 py-0.5 rounded-full bg-sure-blue/10 text-sure-blue dark:bg-sure-blue/30 dark:text-sky-200 font-semibold">FAT</span>
    : <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 font-semibold">SAT</span>

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <div className="flex items-center gap-3">
          {typeBadge}
          <AutoSaveIndicator savedAt={page.savedAt} />
        </div>
      </div>

      <SectionNav sections={SECTIONS} />

      <LockBanner locked={locked} onUnlock={page.unlock} />

      {/* fieldset disabled = natywna blokada WSZYSTKICH pól/przycisków w środku
          gdy raport jest ukończony. Pasek akcji jest poza — pobieranie działa. */}
      <fieldset disabled={locked} className="space-y-4 min-w-0">

      <div id="sec-header">
        <Header header={report.header} onChange={updateHeader} reportType="satfat" />
      </div>

      <div id="sec-a" className="card">
        <h3 className="section-title">A. Typ odbioru i kontekst</h3>
        <ToggleGroup
          items={TEST_TYPE_ITEMS}
          value={report.testType}
          onChange={(k) => setReport((r) => ({ ...r, testType: k }))}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="min-w-0">
            <label className="field-label">Klient / Zamawiający</label>
            <SuggestInput
              type="text"
              className="field-input"
              suggestions={clientSug}
              value={report.info.client}
              onChange={(e) => updateInfo('client', e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <label className="field-label">
              {report.testType === 'fat' ? 'Lokalizacja (fabryka)' : 'Lokalizacja (obiekt)'}
            </label>
            <SuggestInput
              type="text"
              className="field-input"
              suggestions={locationSug}
              value={report.info.location}
              onChange={(e) => updateInfo('location', e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 min-w-0">
          <label className="field-label">Dokument referencyjny / procedura testowa</label>
          <input
            type="text"
            className="field-input"
            placeholder="np. Specyfikacja techniczna v1.2, FAT Protocol PRJ-001"
            value={report.info.referenceDoc}
            onChange={(e) => updateInfo('referenceDoc', e.target.value)}
          />
        </div>
      </div>

      <div id="sec-b" className="card">
        <h3 className="section-title">B. Uczestnicy odbioru</h3>

        <ParticipantsList
          title="Strona klienta"
          icon="👥"
          items={report.participants.client}
          onAdd={() => addParticipant('client')}
          onUpdate={(id, patch) => updateParticipant('client', id, patch)}
          onRemove={(id) => removeParticipant('client', id)}
        />

        <div className="mt-4">
          <ParticipantsList
            title="Strona wykonawcy (SureSolutions)"
            icon="🔧"
            items={report.participants.vendor}
            onAdd={() => addParticipant('vendor')}
            onUpdate={(id, patch) => updateParticipant('vendor', id, patch)}
            onRemove={(id) => removeParticipant('vendor', id)}
          />
        </div>
      </div>

      <div id="sec-c" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">C. Testy odbiorowe</h3>
          <div className="flex items-center gap-2 text-xs">
            {report.tests.length > 0 ? (
              <>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 tabular-nums">{passCount} ✓</span>
                {condCount > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 tabular-nums">{condCount} ~</span>}
                {failCount > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200 tabular-nums">{failCount} ✗</span>}
              </>
            ) : (
              <span className="text-gray-500 dark:text-gray-400">{report.tests.length}</span>
            )}
          </div>
        </div>
        <div className="space-y-3">
          {report.tests.length === 0 ? (
            <EmptyState
              icon="🧪"
              title="Brak testów"
              hint={'Kliknij „+ Dodaj test" poniżej. Listę budujesz na bieżąco — opis + kryterium + wynik. Po dodaniu możesz przeciągać ≡ aby zmieniać kolejność.'}
            />
          ) : (
          <SortableList
            items={report.tests}
            onReorder={(newList) => setReport((r) => ({ ...r, tests: newList }))}
            getId={(t) => t.id}
          >
            {(t, dragHandle, i) => (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-700/40">
              <div className="flex items-center gap-2">
                {dragHandle}
                <span className="index-badge">{i + 1}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">
                  {t.description ? t.description.slice(0, 60) : 'Nowy test'}
                </span>
                <button
                  onClick={() => removeTest(t.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń test"
                >✕</button>
              </div>
              <div>
                <label className="field-label">Opis testu / co testowane</label>
                <MicTextarea
                  placeholder="Co testujemy w tym kroku…"
                  value={t.description}
                  onChange={(e) => updateTest(t.id, { description: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Kryterium akceptacji</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="np. Czujnik zwraca 4-20mA przy 0-100% wypełnienia"
                  value={t.criterion}
                  onChange={(e) => updateTest(t.id, { criterion: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Wynik</label>
                <ToggleGroup
                  size="sm"
                  items={TEST_STATUS_ITEMS}
                  value={t.status}
                  onChange={(k) => updateTest(t.id, { status: k })}
                />
              </div>
              <div>
                <label className="field-label">Uwagi (opcjonalnie)</label>
                <MicTextarea
                  placeholder="Co warto odnotować — pomiary, kontekst, dlaczego warunkowo…"
                  value={t.notes}
                  onChange={(e) => updateTest(t.id, { notes: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Media (zdjęcie HMI, pomiar, wideo)</label>
                <MediaUploader
                  media={t.media || []}
                  onChange={(m) => updateTest(t.id, { media: m })}
                />
              </div>
            </div>
            )}
          </SortableList>
          )}
        </div>
        <button onClick={addTest} className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full">
          + Dodaj test
        </button>
      </div>

      <div id="sec-d" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">D. Lista usterek (punchlist)</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{report.punchlist.length}</span>
        </div>
        <div className="space-y-3">
          {report.punchlist.length === 0 ? (
            <EmptyState
              icon="📝"
              title="Brak usterek"
              hint="Dodawaj uwagi do naprawy/uzupełnienia przed finalnym odbiorem (krytyczne / istotne / drobne)."
            />
          ) : (
          <SortableList
            items={report.punchlist}
            onReorder={(newList) => setReport((r) => ({ ...r, punchlist: newList }))}
            getId={(p) => p.id}
          >
            {(p, dragHandle, i) => (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-700/40">
              <div className="flex items-center gap-2">
                {dragHandle}
                <span className="index-badge">{i + 1}</span>
                <input
                  type="text"
                  className="field-input flex-1 min-w-0"
                  placeholder="Krótki opis usterki"
                  value={p.description}
                  onChange={(e) => updatePunchItem(p.id, { description: e.target.value })}
                />
                <button
                  onClick={() => removePunchItem(p.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń usterkę"
                >✕</button>
              </div>
              <ToggleGroup
                size="sm"
                items={PUNCHLIST_PRIORITY_ITEMS}
                value={p.priority}
                onChange={(k) => updatePunchItem(p.id, { priority: k })}
              />
              <input
                type="text"
                className="field-input"
                placeholder="Dodatkowe uwagi (opcjonalne)"
                value={p.notes}
                onChange={(e) => updatePunchItem(p.id, { notes: e.target.value })}
              />
              <div>
                <label className="field-label">Media (zdjęcie usterki, wideo)</label>
                <MediaUploader
                  media={p.media || []}
                  onChange={(m) => updatePunchItem(p.id, { media: m })}
                />
              </div>
            </div>
            )}
          </SortableList>
          )}
        </div>
        <button onClick={addPunchItem} className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full">
          + Dodaj usterkę
        </button>
      </div>

      <div id="sec-e" className="card">
        <h3 className="section-title">E. Status końcowy odbioru</h3>
        <ToggleGroup
          items={FINAL_STATUS_ITEMS}
          value={report.finalStatus}
          onChange={(k) => setReport((r) => ({ ...r, finalStatus: k }))}
        />
      </div>

      <div id="sec-f" className="card">
        <h3 className="section-title">F. Wnioski i komentarze ogólne</h3>
        <MicTextarea
          value={report.conclusions}
          onChange={(e) => setReport((r) => ({ ...r, conclusions: e.target.value }))}
          placeholder="Podsumowanie odbioru — kluczowe ustalenia, dalsze kroki, harmonogram…"
        />
      </div>

      <div id="sec-g" className="card">
        <h3 className="section-title">G. Podpisy stron</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Pola na imiona/funkcje uczestniczących osób z obu stron — pojawią się w PDF
          jako miejsce na fizyczny podpis.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Strona klienta</div>
            <div>
              <label className="field-label">Imię i nazwisko</label>
              <input
                type="text"
                className="field-input"
                value={report.signatures.clientName}
                onChange={(e) => updateSignature('clientName', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Data podpisu</label>
              <input
                type="date"
                className="field-input"
                value={report.signatures.clientDate}
                onChange={(e) => updateSignature('clientDate', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Strona wykonawcy</div>
            <div>
              <label className="field-label">Imię i nazwisko</label>
              <input
                type="text"
                className="field-input"
                value={report.signatures.vendorName}
                onChange={(e) => updateSignature('vendorName', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Data podpisu</label>
              <input
                type="date"
                className="field-input"
                value={report.signatures.vendorDate}
                onChange={(e) => updateSignature('vendorDate', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div id="sec-h" className="card">
        <h3 className="section-title">H. Dokumentacja fotograficzna (ogólna)</h3>
        <MediaUploader
          media={report.media}
          onChange={(m) => setReport((r) => ({ ...r, media: m }))}
        />
      </div>

      </fieldset>

      <ReportActionBar page={page} status={report.status} navigate={navigate} />
    </div>
  )
}

// Sub-component for one side of the participants list (client or vendor).
// Both sides share identical structure — just a different title/icon.
function ParticipantsList({ title, icon, items, onAdd, onUpdate, onRemove }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <span>{icon}</span>
          <span>{title}</span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.length === 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 italic py-2">
            Brak wpisów. Dodaj osoby uczestniczące w odbiorze.
          </div>
        )}
        {items.map((p, i) => (
          // Mobile: dwa rzędy (imię + delete na górze, funkcja pod spodem).
          // Desktop (sm+): wszystko w jednej linii. Przycisk usuń wyrenderowany
          // dwa razy z `sm:hidden` / `hidden sm:inline-flex` — sprzęga dwa różne
          // layouty bez zewnętrznych helperów, klik z każdej kopii woła onRemove.
          <div key={p.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 sm:flex-1">
              <span className="index-badge shrink-0">{i + 1}</span>
              <input
                type="text"
                className="field-input flex-1 min-w-0"
                placeholder="Imię i nazwisko"
                value={p.name}
                onChange={(e) => onUpdate(p.id, { name: e.target.value })}
              />
              <button
                onClick={() => onRemove(p.id)}
                className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40 shrink-0 sm:hidden"
                aria-label="Usuń osobę"
              >✕</button>
            </div>
            <input
              type="text"
              className="field-input min-w-0 sm:flex-1"
              placeholder="Funkcja / stanowisko"
              value={p.role}
              onChange={(e) => onUpdate(p.id, { role: e.target.value })}
            />
            <button
              onClick={() => onRemove(p.id)}
              className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40 shrink-0 hidden sm:inline-flex"
              aria-label="Usuń osobę"
            >✕</button>
          </div>
        ))}
      </div>
      <button onClick={onAdd} className="mt-2 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full">
        + Dodaj osobę
      </button>
    </div>
  )
}
