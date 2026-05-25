import { useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import SectionNav from '../common/SectionNav.jsx'
import EmptyState from '../common/EmptyState.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import LoadingOverlay from '../common/LoadingOverlay.jsx'
import SortableList from '../common/SortableList.jsx'
import SuggestInput from '../common/SuggestInput.jsx'
import { suggestComponents } from '../../utils/suggestions.js'
import { useToast, useConfirm } from '../common/Toast.jsx'
import { getById, newId } from '../../utils/storage.js'
import { useAutoSave } from '../../utils/useAutoSave.js'
import { generatePrototypePackage } from '../../utils/pdfGenerator.js'
import { ensureValidOrConfirm } from '../../utils/validateReport.js'
import { exportReportPackage, shareOrDownload, downloadBlob, makePackageFilename } from '../../utils/syncPackage.js'

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
      reportNumber: '', projectName: '', machineName: '',
      date: todayISO(), author: '',
    },
    info: {
      component: '', iteration: 1,
      sampleMethod: 'print3d', sampleMethodOther: '', goal: '',
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

  const toast = useToast()
  const confirm = useConfirm()
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)

  // Debounced auto-save (300ms idle) — keeps typing smooth without losing data
  const savedAt = useAutoSave(report)

  const updateHeader = (h) => setReport((r) => ({ ...r, header: h }))
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

  const finishReport = async () => {
    if (!(await confirm('Oznaczyć raport jako ukończony? Możesz go potem nadal edytować i pobrać paczkę.', {
      confirmLabel: 'Oznacz', title: 'Zakończenie raportu'
    }))) return
    setReport((r) => ({ ...r, status: 'completed' }))
    toast.success('Raport oznaczony jako ukończony')
  }

  // Sync paczka. forceDownload=true → zawsze lokalnie. Patrz ServiceReport.
  const sendToDevice = async (forceDownload = false) => {
    setSending(true)
    try {
      const blob = await exportReportPackage(report)
      const filename = makePackageFilename(report)
      if (forceDownload) {
        downloadBlob(blob, filename)
        toast.success('Plik zapisany lokalnie')
      } else {
        await shareOrDownload(blob, filename)
        toast.success('Paczka gotowa do przesłania')
      }
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setSending(false)
    }
  }

  const downloadPdf = async () => {
    if (!(await ensureValidOrConfirm(report, confirm))) return
    setDownloading(true)
    try {
      await generatePrototypePackage(report)
      toast.success('Paczka pobrana')
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setDownloading(false)
    }
  }

  const okCount = report.points.filter((p) => p.result === 'ok').length
  const nokCount = report.points.filter((p) => p.result === 'nok').length
  const condCount = report.points.filter((p) => p.result === 'cond').length

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <AutoSaveIndicator savedAt={savedAt} />
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
        Test #{report.info.iteration || 1}
      </div>

      <SectionNav sections={SECTIONS} />

      <div id="sec-header">
        <Header header={report.header} onChange={updateHeader} reportType="prototype" />
      </div>

      <div id="sec-a" className="card">
        <h3 className="section-title">A. Informacje o teście</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="field-label">Testowany podzespół</label>
            <SuggestInput type="text" className="field-input"
              suggestions={suggestComponents()}
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
        <div className="mt-3">
          <label className="field-label">Cel testu</label>
          <textarea className="field-textarea"
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
          <textarea className="field-textarea"
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
              <input type="text" className="field-input"
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
        <textarea className="field-textarea"
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
        <textarea className="field-textarea"
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

      <LoadingOverlay visible={downloading} />

      <div className="action-bar">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="btn-primary flex-[2] text-base"
          >
            {downloading ? '⏳ Generowanie…' : '📦 Pobierz paczkę (PDF + media)'}
          </button>
          {report.status !== 'completed' && (
            <button onClick={finishReport} className="btn-success flex-1">
              ✓ Oznacz ukończony
            </button>
          )}
          <button
            onClick={() => sendToDevice(false)}
            disabled={sending}
            className="btn-secondary flex-1"
            title="Udostępnij paczkę przez systemowe menu (AirDrop/Mail/OneDrive)"
          >
            {sending ? '⏳' : '📤 Wyślij'}
          </button>
          <button
            onClick={() => sendToDevice(true)}
            disabled={sending}
            className="btn-secondary flex-1"
            title="Pobierz paczkę jako plik (do Pobranych/Files)"
          >
            {sending ? '⏳' : '💾 Pobierz plik'}
          </button>
          <button onClick={() => navigate('')} className="btn-secondary flex-1">
            Zapisz i wyjdź
          </button>
        </div>
      </div>
    </div>
  )
}
