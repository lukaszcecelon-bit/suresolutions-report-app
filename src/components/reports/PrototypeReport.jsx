import { useMemo, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import SectionNav from '../common/SectionNav.jsx'
import EmptyState from '../common/EmptyState.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import SortableList from '../common/SortableList.jsx'
import ReportActionBar, { LockBanner } from '../common/ReportActionBar.jsx'
import SuggestInput from '../common/SuggestInput.jsx'
import { MicTextarea, MicInput } from '../common/VoiceMic.jsx'
import { suggestComponents } from '../../utils/suggestions.js'
import { getById, newId } from '../../utils/storage.js'
import { computeReportNumber } from '../../utils/reportNumber.js'
import { nowHHMM, durationBetweenLabel } from '../../utils/time.js'
import { getDefaultAuthor } from '../../utils/settings.js'
import { useReportPage } from '../../utils/useReportPage.js'
import { buildPrototypePackage, buildPrototypePdf } from '../../utils/pdfGenerator.js'

const SAMPLE_METHOD_ITEMS = [
  { key: 'print3d', label: 'Druk 3D' },
  { key: 'cnc',     label: 'Obróbka CNC' },
  { key: 'other',   label: 'Inne' },
]

const POINT_RESULT_ITEMS = [
  { key: 'ok',   label: 'OK',         icon: '✓', activeClass: 'bg-emerald-600 text-white border-transparent' },
  { key: 'nok',  label: 'NOK',        icon: '✗', activeClass: 'bg-red-600 text-white border-transparent' },
  { key: 'cond', label: 'Warunkowo',  icon: '~', activeClass: 'bg-amber-500 text-white border-transparent' },
]

const OVERALL_RESULT_ITEMS = [
  { key: 'positive',    label: 'Pozytywny',            activeClass: 'bg-emerald-600 text-white border-transparent' },
  { key: 'negative',    label: 'Negatywny',            activeClass: 'bg-red-600 text-white border-transparent' },
  { key: 'conditional', label: 'Warunkowo pozytywny',  activeClass: 'bg-amber-500 text-white border-transparent' },
]

const DECISION_ITEMS = [
  { key: 'implement', label: 'Wdrożyć rozwiązanie',         icon: '✓', activeClass: 'bg-emerald-600 text-white border-transparent' },
  { key: 'iterate',   label: 'Poprawki → kolejna iteracja', icon: '⟳', activeClass: 'bg-sure-blue text-white border-transparent' },
  { key: 'reject',    label: 'Odrzucić koncepcję',          icon: '✗', activeClass: 'bg-red-600 text-white border-transparent' },
]

const SECTIONS = [
  { id: 'sec-header', label: 'Nagłówek' },
  { id: 'sec-a',      label: 'A. Test' },
  { id: 'sec-b',      label: 'B. Warunki' },
  { id: 'sec-c',      label: 'C. Wyniki' },
  { id: 'sec-d',      label: 'D. Wnioski' },
  { id: 'sec-e',      label: 'E. Decyzja' },
  { id: 'sec-f',      label: 'F. Foto' },
]

const MAX_PARAMS = 10
const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()

function defaultReport() {
  return {
    id: newId(),
    type: 'prototype',
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    header: {
      projectNumber: '', reportNumber: '', projectName: '', machineName: '',
      date: todayISO(), author: getDefaultAuthor(),
    },
    info: {
      component: '', iteration: 1,
      sampleMethod: 'print3d', sampleMethodOther: '', goal: '',
      startTime: '', endTime: '',   // v0.52 — czas trwania testu do analizy
      media: [],
    },
    conditions: { setup: '', params: [] },
    points: [],
    overallResult: '',
    resultsMedia: [],
    observations: '',
    observationsMedia: [],
    decision: '',
    decisionNotes: '',
    media: [],
  }
}

export default function PrototypeReport({ navigate, reportId }) {
  const [report, setReport] = useState(() => {
    if (reportId) {
      const existing = getById(reportId)
      if (existing) return existing
    }
    return defaultReport()
  })

  // Wspólny szkielet strony raportu: auto-save, paczki, lock ukończonych.
  const page = useReportPage({ report, setReport, buildPackage: buildPrototypePackage, buildPdf: buildPrototypePdf })
  const { confirm, locked } = page

  // Memoizowane źródło autouzupełniania (raz na mount, nie co render).
  const componentSug = useMemo(() => suggestComponents(), [])

  // Numer raportu liczony automatycznie z numeru projektu + daty (jak w serwisie).
  // Pusty numer projektu → zachowaj ewentualny ręczny numer starszych raportów.
  const updateHeader = (h) => setReport((r) => ({
    ...r,
    header: { ...h, reportNumber: computeReportNumber('PRT', h.projectNumber, h.date, h.reportNumber) },
  }))
  const setInfo = (k, v) => setReport((r) => ({ ...r, info: { ...r.info, [k]: v } }))
  const setCondField = (k, v) => setReport((r) => ({ ...r, conditions: { ...r.conditions, [k]: v } }))

  const addParam = () => {
    setReport((r) => {
      if (r.conditions.params.length >= MAX_PARAMS) return r
      return {
        ...r,
        conditions: {
          ...r.conditions,
          params: [...r.conditions.params, { id: newId(), key: '', value: '' }],
        },
      }
    })
  }
  const updateParam = (id, patch) => {
    setReport((r) => ({
      ...r,
      conditions: {
        ...r.conditions,
        params: r.conditions.params.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      },
    }))
  }
  const removeParam = (id) => {
    setReport((r) => ({
      ...r,
      conditions: { ...r.conditions, params: r.conditions.params.filter((p) => p.id !== id) },
    }))
  }

  const addPoint = () => {
    setReport((r) => ({
      ...r,
      points: [...r.points, { id: newId(), description: '', result: 'ok', comment: '', media: [] }],
    }))
  }
  const updatePoint = (id, patch) => {
    setReport((r) => ({ ...r, points: r.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }
  const removePoint = async (id) => {
    if (!(await confirm('Usunąć ten punkt kontrolny?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({ ...r, points: r.points.filter((p) => p.id !== id) }))
  }

  const { okCount, nokCount, condCount } = useMemo(() => ({
    okCount: report.points.filter((p) => p.result === 'ok').length,
    nokCount: report.points.filter((p) => p.result === 'nok').length,
    condCount: report.points.filter((p) => p.result === 'cond').length,
  }), [report.points])

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <AutoSaveIndicator savedAt={page.savedAt} />
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
        Test #{report.info.iteration || 1}
      </div>

      <SectionNav sections={SECTIONS} report={report} />

      <LockBanner locked={locked} onUnlock={page.unlock} />

      {/* fieldset disabled = natywna blokada WSZYSTKICH pól/przycisków w środku
          gdy raport jest ukończony. Pasek akcji jest poza — pobieranie działa. */}
      <fieldset disabled={locked} className="space-y-4 min-w-0">

      <div id="sec-header">
        <Header header={report.header} onChange={updateHeader} reportType="prototype" showClient />
      </div>

      <div id="sec-a" className="card">
        <h3 className="section-title">A. Informacje o teście</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="field-label">Testowany podzespół</label>
            <SuggestInput type="text" className="field-input"
              suggestions={componentSug}
              value={report.info.component}
              onChange={(e) => setInfo('component', e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Numer iteracji (Test #)</label>
            <input type="number" min="1" className="field-input"
              value={report.info.iteration}
              onChange={(e) => setInfo('iteration', parseInt(e.target.value, 10) || 1)} />
          </div>
        </div>
        <div className="mt-3">
          <label className="field-label">Metoda wytworzenia próbki</label>
          <ToggleGroup
            items={SAMPLE_METHOD_ITEMS}
            value={report.info.sampleMethod}
            onChange={(k) => setInfo('sampleMethod', k)}
          />
          {report.info.sampleMethod === 'other' && (
            <input type="text" className="field-input mt-2"
              placeholder="Opisz metodę…"
              value={report.info.sampleMethodOther}
              onChange={(e) => setInfo('sampleMethodOther', e.target.value)} />
          )}
        </div>
        {/* Godziny testu (v0.52) — pozwalają policzyć, ile czasu zjada iteracja. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="min-w-0">
            <label className="field-label">Start testu</label>
            <div className="flex gap-2">
              <input type="time" className="field-input flex-1 min-w-0"
                value={report.info.startTime || ''}
                onChange={(e) => setInfo('startTime', e.target.value)} />
              <button type="button" onClick={() => setInfo('startTime', nowHHMM())}
                className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 shrink-0 whitespace-nowrap"
                title="Wstaw aktualną godzinę">⏱ Teraz</button>
            </div>
          </div>
          <div className="min-w-0">
            <label className="field-label">Koniec testu</label>
            <div className="flex gap-2">
              <input type="time" className="field-input flex-1 min-w-0"
                value={report.info.endTime || ''}
                onChange={(e) => setInfo('endTime', e.target.value)} />
              <button type="button" onClick={() => setInfo('endTime', nowHHMM())}
                className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 shrink-0 whitespace-nowrap"
                title="Wstaw aktualną godzinę">⏱ Teraz</button>
            </div>
          </div>
        </div>
        {durationBetweenLabel(report.info.startTime, report.info.endTime) && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Czas testu: <strong className="text-sure-dark dark:text-gray-100">{durationBetweenLabel(report.info.startTime, report.info.endTime)}</strong>
          </div>
        )}
        <div className="mt-3">
          <label className="field-label">Cel testu</label>
          <MicTextarea
            value={report.info.goal}
            onChange={(e) => setInfo('goal', e.target.value)}
            placeholder="Co chcemy zweryfikować tą iteracją?" />
        </div>
        <div className="mt-3">
          <label className="field-label">Zdjęcia (opcjonalne)</label>
          <MediaUploader photoOnly
            media={report.info.media || []}
            onChange={(m) => setInfo('media', m)} />
        </div>
      </div>

      <div id="sec-b" className="card">
        <h3 className="section-title">B. Warunki testu</h3>
        <div>
          <label className="field-label">Opis setupu testowego</label>
          <MicTextarea
            value={report.conditions.setup}
            onChange={(e) => setCondField('setup', e.target.value)}
            placeholder="Jak zorganizowano test, jakie warunki, jakie urządzenia pomiarowe…" />
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="field-label mb-0">
              Parametry ({report.conditions.params.length}/{MAX_PARAMS})
            </label>
          </div>
          <div className="space-y-2">
            {report.conditions.params.length === 0 && (
              <EmptyState
                icon="📐"
                title="Brak parametrów"
                hint={`Dodaj do ${MAX_PARAMS} par „parametr → wartość" (np. Temperatura → 180°C).`}
              />
            )}
            {report.conditions.params.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="index-badge">{i + 1}</span>
                <input type="text" className="field-input flex-1"
                  placeholder="Parametr (np. Temperatura)"
                  value={p.key}
                  onChange={(e) => updateParam(p.id, { key: e.target.value })} />
                <input type="text" className="field-input flex-1"
                  placeholder="Wartość (np. 180°C)"
                  value={p.value}
                  onChange={(e) => updateParam(p.id, { value: e.target.value })} />
                <button
                  onClick={() => removeParam(p.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń parametr"
                >✕</button>
              </div>
            ))}
          </div>
          <button
            onClick={addParam}
            disabled={report.conditions.params.length >= MAX_PARAMS}
            className="mt-2 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full"
          >
            + Dodaj parametr
          </button>
        </div>
      </div>

      <div id="sec-c" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">C. Wyniki testu</h3>
          {report.points.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              ✓ {okCount} · ✗ {nokCount} · ~ {condCount}
            </span>
          )}
        </div>
        <div className="space-y-3">
          {report.points.length === 0 ? (
            <EmptyState
              icon="✅"
              title="Brak punktów kontrolnych"
              hint="Dodaj punkty i oznacz ich wyniki (OK / NOK / Warunkowo). ≡ pozwala zmieniać kolejność."
            />
          ) : (
          <SortableList
            items={report.points}
            onReorder={(newList) => setReport((r) => ({ ...r, points: newList }))}
            getId={(p) => p.id}
          >
            {(p, dragHandle, i) => (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-700/40">
              <div className="flex items-center gap-2">
                {dragHandle}
                <span className="index-badge">{i + 1}</span>
                <input type="text" className="field-input flex-1"
                  placeholder="Opis punktu kontrolnego"
                  value={p.description}
                  onChange={(e) => updatePoint(p.id, { description: e.target.value })} />
                <button
                  onClick={() => removePoint(p.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń punkt"
                >✕</button>
              </div>
              <ToggleGroup
                size="sm"
                items={POINT_RESULT_ITEMS}
                value={p.result}
                onChange={(k) => updatePoint(p.id, { result: k })}
              />
              <MicInput type="text" className="field-input"
                placeholder="Komentarz (opcjonalny)"
                value={p.comment}
                onChange={(e) => updatePoint(p.id, { comment: e.target.value })} />
              <div>
                <label className="field-label">Zdjęcia (opcjonalne)</label>
                <MediaUploader photoOnly
                  media={p.media || []}
                  onChange={(m) => updatePoint(p.id, { media: m })} />
              </div>
            </div>
            )}
          </SortableList>
          )}
        </div>
        <button onClick={addPoint} className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full">
          + Dodaj punkt
        </button>

        <div className="mt-4">
          <label className="field-label">Ogólna ocena testu</label>
          <ToggleGroup
            items={OVERALL_RESULT_ITEMS}
            value={report.overallResult}
            onChange={(k) => setReport((r) => ({ ...r, overallResult: k }))}
          />
        </div>

        <div className="mt-4">
          <label className="field-label">Zdjęcia ogólne do wyników (opcjonalne)</label>
          <MediaUploader photoOnly
            media={report.resultsMedia || []}
            onChange={(m) => setReport((r) => ({ ...r, resultsMedia: m }))} />
        </div>
      </div>

      <div id="sec-d" className="card">
        <h3 className="section-title">D. Obserwacje i wnioski</h3>
        <MicTextarea
          value={report.observations}
          onChange={(e) => setReport((r) => ({ ...r, observations: e.target.value }))}
          placeholder="Co zauważyłeś, jakie hipotezy potwierdziły się / zostały obalone…" />
        <div className="mt-3">
          <label className="field-label">Zdjęcia (opcjonalne)</label>
          <MediaUploader photoOnly
            media={report.observationsMedia || []}
            onChange={(m) => setReport((r) => ({ ...r, observationsMedia: m }))} />
        </div>
      </div>

      <div id="sec-e" className="card">
        <h3 className="section-title">E. Decyzja</h3>
        <ToggleGroup
          items={DECISION_ITEMS}
          value={report.decision}
          onChange={(k) => setReport((r) => ({ ...r, decision: k }))}
        />
        <label className="field-label mt-3">Opis decyzji / kolejne kroki</label>
        <MicTextarea
          value={report.decisionNotes}
          onChange={(e) => setReport((r) => ({ ...r, decisionNotes: e.target.value }))}
          placeholder="Co dokładnie zostanie zmienione w kolejnej iteracji / jak wdrożyć…" />
      </div>

      <div id="sec-f" className="card">
        <h3 className="section-title">F. Dokumentacja fotograficzna</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Zdjęcia / wideo do całego testu (nieprzypisane do konkretnego punktu).
        </p>
        <MediaUploader
          media={report.media}
          onChange={(m) => setReport((r) => ({ ...r, media: m }))} />
      </div>

      </fieldset>

      <ReportActionBar page={page} status={report.status} navigate={navigate} />
    </div>
  )
}
