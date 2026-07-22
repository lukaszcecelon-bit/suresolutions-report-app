import { useMemo, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import SectionNav from '../common/SectionNav.jsx'
import EmptyState from '../common/EmptyState.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import SortableList from '../common/SortableList.jsx'
import ReportActionBar, { LockBanner } from '../common/ReportActionBar.jsx'
import NotesList from '../common/NotesList.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import SuggestInput from '../common/SuggestInput.jsx'
import {
  suggestClients, suggestLocations,
  suggestPartNames, suggestPartCatalogNos,
} from '../../utils/suggestions.js'
import { getById, newId } from '../../utils/storage.js'
import { computeReportNumber } from '../../utils/reportNumber.js'
import { getDefaultAuthor, getDefaultRole, ROLE_OPTIONS } from '../../utils/settings.js'
import { useReportPage } from '../../utils/useReportPage.js'
import { buildServicePackage, buildServicePdf } from '../../utils/pdfGenerator.js'

const PRIORITY_ITEMS = [
  { key: 'urgent',  label: 'Pilne',      icon: '🔴', activeClass: 'bg-red-100 text-red-700 border-red-400 font-semibold' },
  { key: 'planned', label: 'Planowe',    icon: '🟡', activeClass: 'bg-amber-100 text-amber-800 border-amber-400 font-semibold' },
  { key: 'watch',   label: 'Obserwacja', icon: '🟢', activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-400 font-semibold' },
]

// Statusy wizyty (klucze zachowane dla kompatybilności danych, etykiety nowe).
const STATUS_ITEMS = [
  { key: 'completed', label: 'Zakończono (maszyna działa)',        icon: '✓',  activeClass: 'bg-emerald-600 text-white border-transparent' },
  { key: 'followup',  label: 'Wymaga spotkania / dalszych działań', icon: '⏳', activeClass: 'bg-amber-500 text-white border-transparent' },
  { key: 'parts',     label: 'Maszyna zatrzymana',                  icon: '🔴', activeClass: 'bg-red-600 text-white border-transparent' },
]

const SECTIONS = [
  { id: 'sec-header',  label: 'Nagłówek' },
  { id: 'sec-a',       label: 'A. Wizyta' },
  { id: 'sec-b',       label: 'B. Czynności' },
  { id: 'sec-c',       label: 'C. Części' },
  { id: 'sec-d',       label: 'D. Obserwacje' },
  { id: 'sec-e',       label: 'E. Rekomendacje' },
  { id: 'sec-f',       label: 'F. Status' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()
const nowHHMM = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Łączny czas wizyty z godzin przyjazdu/odjazdu (HH:MM). Obsługuje przejście
// przez północ (odjazd następnego dnia). Zwraca czytelną etykietę lub null.
function visitDurationLabel(arrival, departure) {
  if (!arrival || !departure) return null
  const [ah, am] = arrival.split(':').map(Number)
  const [dh, dm] = departure.split(':').map(Number)
  if ([ah, am, dh, dm].some((n) => Number.isNaN(n))) return null
  let mins = (dh * 60 + dm) - (ah * 60 + am)
  if (mins < 0) mins += 24 * 60
  if (mins === 0) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

function defaultReport() {
  return {
    id: newId(),
    type: 'service',
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    header: {
      projectNumber: '',   // numer projektu (wpisywany)
      reportNumber: '',    // auto: RPT-{projectNumber}-{date}
      projectName: '',
      machineName: '',
      date: todayISO(),
      author: getDefaultAuthor(),   // domyślny autor z Ustawień (per urządzenie)
    },
    visit: { client: '', location: '', arrival: '', departure: '', attendees: '' },
    role: getDefaultRole(),         // domyślna rola z Ustawień
    actions: [],
    parts: [],
    observations: [],       // lista rekordów {id, text, media}
    recommendations: [],    // lista rekordów {id, text, media} (jak obserwacje)
    receivedBy: '',         // kto odebrał prace serwisowe
    visitStatus: 'completed',
  }
}

export default function ServiceReport({ navigate, reportId }) {
  // Migracja string→lista dla observations/recommendations jest centralna
  // (storage.migrateReport, SCHEMA_VERSION 2) — getById zwraca już zmigrowany
  // rekord, więc lokalna kopia była martwa (i mutowała referencję z cache).
  const [report, setReport] = useState(() => {
    if (reportId) {
      const existing = getById(reportId)
      if (existing) return existing
    }
    return defaultReport()
  })

  // Wspólny szkielet strony raportu: auto-save, paczki, lock ukończonych.
  const page = useReportPage({ report, setReport, buildPackage: buildServicePackage, buildPdf: buildServicePdf })
  const { confirm, locked } = page

  // Źródła autouzupełniania — memoizowane, żeby nie przeliczać całego localStorage
  // przy każdym renderze (a part-suggestions były liczone PER część PER render).
  const clientSug = useMemo(() => suggestClients(), [])
  const locationSug = useMemo(() => suggestLocations(report.visit.client), [report.visit.client])
  const partNameSug = useMemo(() => suggestPartNames(), [])
  const partCatalogSug = useMemo(() => suggestPartCatalogNos(), [])

  // Nagłówek: po każdej zmianie przelicz numer raportu z numeru projektu + daty.
  const updateHeader = (h) => {
    setReport((r) => ({
      ...r,
      header: { ...h, reportNumber: computeReportNumber('RPT', h.projectNumber, h.date, h.reportNumber) },
    }))
  }
  const updateVisit = (k, v) => setReport((r) => ({ ...r, visit: { ...r.visit, [k]: v } }))

  // ---- Czynności ----
  const addAction = () => {
    setReport((r) => ({
      ...r,
      actions: [...r.actions, { id: newId(), description: '', media: [] }],
    }))
  }
  const updateAction = (id, patch) => {
    setReport((r) => ({ ...r, actions: r.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  }
  const removeAction = async (id) => {
    if (!(await confirm('Usunąć tę czynność?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({ ...r, actions: r.actions.filter((a) => a.id !== id) }))
  }

  // ---- Elementy do wymiany ----
  const addPart = () => {
    setReport((r) => ({
      ...r,
      parts: [...r.parts, { id: newId(), name: '', catalogNo: '', priority: 'planned', comment: '', media: [] }],
    }))
  }
  const updatePart = (id, patch) => {
    setReport((r) => ({ ...r, parts: r.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }
  const removePart = async (id) => {
    if (!(await confirm('Usunąć ten element?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({ ...r, parts: r.parts.filter((p) => p.id !== id) }))
  }

  const totalTime = visitDurationLabel(report.visit.arrival, report.visit.departure)

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <AutoSaveIndicator savedAt={page.savedAt} />
      </div>

      <SectionNav sections={SECTIONS} report={report} />

      <LockBanner locked={locked} onUnlock={page.unlock} />

      {/* fieldset disabled = natywna blokada WSZYSTKICH pól/przycisków w środku
          gdy raport jest ukończony. Pasek akcji jest poza — pobieranie działa. */}
      <fieldset disabled={locked} className="space-y-4 min-w-0">

      <div id="sec-header">
        <Header header={report.header} onChange={updateHeader} reportType="service" />
      </div>

      <div id="sec-a" className="card">
        <h3 className="section-title">A. Dane wizyty</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="field-label">Nazwa klienta</label>
            <SuggestInput type="text" className="field-input"
              suggestions={clientSug}
              value={report.visit.client}
              onChange={(e) => updateVisit('client', e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Lokalizacja / adres obiektu</label>
            <SuggestInput type="text" className="field-input"
              suggestions={locationSug}
              value={report.visit.location}
              onChange={(e) => updateVisit('location', e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Rola</label>
            <select
              className="field-input"
              value={report.role || ''}
              onChange={(e) => setReport((r) => ({ ...r, role: e.target.value }))}
            >
              <option value="">— wybierz —</option>
              {ROLE_OPTIONS.map((ro) => <option key={ro} value={ro}>{ro}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="field-label">Liczba osób obecnych na serwisie</label>
            <input type="number" inputMode="numeric" min="0" className="field-input"
              placeholder="np. 3"
              value={report.visit.attendees ?? ''}
              onChange={(e) => updateVisit('attendees', e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Godzina przyjazdu</label>
            <div className="flex gap-2">
              <input type="time" className="field-input flex-1 min-w-0"
                value={report.visit.arrival}
                onChange={(e) => updateVisit('arrival', e.target.value)} />
              <button type="button" onClick={() => updateVisit('arrival', nowHHMM())}
                className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 shrink-0 whitespace-nowrap"
                title="Wstaw aktualną godzinę">⏱ Teraz</button>
            </div>
          </div>
          <div className="min-w-0">
            <label className="field-label">Godzina odjazdu</label>
            <div className="flex gap-2">
              <input type="time" className="field-input flex-1 min-w-0"
                value={report.visit.departure}
                onChange={(e) => updateVisit('departure', e.target.value)} />
              <button type="button" onClick={() => updateVisit('departure', nowHHMM())}
                className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 shrink-0 whitespace-nowrap"
                title="Wstaw aktualną godzinę">⏱ Teraz</button>
            </div>
          </div>
        </div>
        {totalTime && (
          <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
            Łączny czas wizyty: <strong className="text-sure-dark dark:text-gray-100">{totalTime}</strong>
          </div>
        )}
      </div>

      <div id="sec-b" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">B. Wykonane czynności</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{report.actions.length}</span>
        </div>
        <div className="space-y-3">
          {report.actions.length === 0 ? (
            <EmptyState
              icon="🛠️"
              title="Brak czynności"
              hint={'Kliknij „+ Dodaj czynność" poniżej aby dodać pierwszą. Po dodaniu możesz przeciągać ≡ aby zmieniać kolejność.'}
            />
          ) : (
          <SortableList
            items={report.actions}
            onReorder={(newList) => setReport((r) => ({ ...r, actions: newList }))}
            getId={(a) => a.id}
          >
            {(a, dragHandle, i) => (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-700/40">
              <div className="flex items-center gap-2">
                {dragHandle}
                <span className="index-badge">{i + 1}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">
                  {a.description ? a.description.slice(0, 60) : 'Nowa czynność'}
                </span>
                <button
                  onClick={() => removeAction(a.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń czynność"
                >✕</button>
              </div>
              <MicTextarea
                placeholder="Opis czynności…"
                value={a.description}
                onChange={(e) => updateAction(a.id, { description: e.target.value })}
              />
              <div>
                <label className="field-label">Zdjęcia (opcjonalne)</label>
                <MediaUploader
                  photoOnly
                  media={a.media || []}
                  onChange={(m) => updateAction(a.id, { media: m })}
                />
              </div>
            </div>
            )}
          </SortableList>
          )}
        </div>
        <button onClick={addAction} className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full">
          + Dodaj czynność
        </button>
      </div>

      <div id="sec-c" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">C. Elementy do wymiany / uwagi</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{report.parts.length}</span>
        </div>
        <div className="space-y-3">
          {report.parts.length === 0 ? (
            <EmptyState
              icon="🔩"
              title="Brak elementów"
              hint="Dodaj części wymagające wymiany lub punkty wymagające obserwacji. ≡ pozwala zmieniać kolejność."
            />
          ) : (
          <SortableList
            items={report.parts}
            onReorder={(newList) => setReport((r) => ({ ...r, parts: newList }))}
            getId={(p) => p.id}
          >
            {(p, dragHandle, i) => (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-700/40">
              <div className="flex items-center gap-2">
                {dragHandle}
                <span className="index-badge">{i + 1}</span>
                <SuggestInput type="text" className="field-input flex-1 min-w-0"
                  placeholder="Nazwa elementu"
                  suggestions={partNameSug}
                  value={p.name}
                  onChange={(e) => updatePart(p.id, { name: e.target.value })} />
                <button
                  onClick={() => removePart(p.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń element"
                >✕</button>
              </div>
              <SuggestInput type="text" className="field-input"
                placeholder="Numer katalogowy (opcjonalny)"
                suggestions={partCatalogSug}
                value={p.catalogNo}
                onChange={(e) => updatePart(p.id, { catalogNo: e.target.value })} />
              <ToggleGroup
                size="sm"
                items={PRIORITY_ITEMS}
                value={p.priority}
                onChange={(k) => updatePart(p.id, { priority: k })}
              />
              <input type="text" className="field-input"
                placeholder="Komentarz (opcjonalny)"
                value={p.comment}
                onChange={(e) => updatePart(p.id, { comment: e.target.value })} />
              <div>
                <label className="field-label">Zdjęcia (opcjonalne)</label>
                <MediaUploader
                  photoOnly
                  media={p.media || []}
                  onChange={(m) => updatePart(p.id, { media: m })}
                />
              </div>
            </div>
            )}
          </SortableList>
          )}
        </div>
        <button onClick={addPart} className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full">
          + Dodaj element
        </button>
      </div>

      <div id="sec-d" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">D. Obserwacje własne</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{report.observations.length}</span>
        </div>
        <NotesList
          items={report.observations}
          onChange={(v) => setReport((r) => ({ ...r, observations: v }))}
          confirm={confirm}
          addLabel="+ Dodaj obserwację"
          placeholder="Co zauważyłeś podczas wizyty?"
          emptyIcon="👁️"
          emptyTitle="Brak obserwacji"
          emptyHint={'Kliknij „+ Dodaj obserwację" poniżej. Każda obserwacja to osobny wpis — możesz dodać zdjęcie i zmieniać kolejność (≡).'}
          removeConfirm="Usunąć tę obserwację?"
          newItemLabel="Nowa obserwacja"
        />
      </div>

      <div id="sec-e" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">E. Rekomendacje</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{report.recommendations.length}</span>
        </div>
        <NotesList
          items={report.recommendations}
          onChange={(v) => setReport((r) => ({ ...r, recommendations: v }))}
          confirm={confirm}
          addLabel="+ Dodaj rekomendację"
          placeholder="Co rekomendujesz klientowi / dalsze kroki…"
          emptyIcon="💡"
          emptyTitle="Brak rekomendacji"
          emptyHint={'Kliknij „+ Dodaj rekomendację" poniżej. Każda rekomendacja to osobny wpis.'}
          removeConfirm="Usunąć tę rekomendację?"
          newItemLabel="Nowa rekomendacja"
        />
      </div>

      <div id="sec-f" className="card">
        <h3 className="section-title">F. Status wizyty</h3>
        <ToggleGroup
          items={STATUS_ITEMS}
          value={report.visitStatus}
          onChange={(k) => setReport((r) => ({ ...r, visitStatus: k }))}
        />
        <div className="mt-4 min-w-0">
          <label className="field-label">Odbiór prac — osoba (kto odebrał)</label>
          <input
            type="text"
            className="field-input"
            placeholder="Imię i nazwisko / stanowisko osoby odbierającej"
            value={report.receivedBy || ''}
            onChange={(e) => setReport((r) => ({ ...r, receivedBy: e.target.value }))}
          />
        </div>
      </div>

      </fieldset>

      <ReportActionBar page={page} status={report.status} navigate={navigate} />
    </div>
  )
}
