import { useEffect, useRef, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import { upsert, getById, newId } from '../../utils/storage.js'
import { generatePrototypePdf } from '../../utils/pdfGenerator.js'

const SAMPLE_METHODS = [
  { key: 'print3d', label: 'Druk 3D' },
  { key: 'cnc', label: 'Obróbka CNC' },
  { key: 'other', label: 'Inne' },
]

const POINT_RESULTS = [
  { key: 'ok', label: 'OK', icon: '✓', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', active: 'bg-emerald-600 text-white border-transparent' },
  { key: 'nok', label: 'NOK', icon: '✗', color: 'bg-red-100 text-red-700 border-red-300', active: 'bg-red-600 text-white border-transparent' },
  { key: 'cond', label: 'Warunkowo', icon: '~', color: 'bg-amber-100 text-amber-700 border-amber-300', active: 'bg-amber-500 text-white border-transparent' },
]

const OVERALL_RESULTS = [
  { key: 'positive', label: 'Pozytywny', color: 'bg-emerald-600' },
  { key: 'negative', label: 'Negatywny', color: 'bg-red-600' },
  { key: 'conditional', label: 'Warunkowo pozytywny', color: 'bg-amber-500' },
]

const DECISIONS = [
  { key: 'implement', label: 'Wdrożyć rozwiązanie', icon: '✓', color: 'bg-emerald-600' },
  { key: 'iterate', label: 'Poprawki → kolejna iteracja', icon: '⟳', color: 'bg-sure-blue' },
  { key: 'reject', label: 'Odrzucić koncepcję', icon: '✗', color: 'bg-red-600' },
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
      reportNumber: '',
      projectName: '',
      machineName: '',
      date: todayISO(),
      author: '',
    },
    info: {
      component: '',
      iteration: 1,
      sampleMethod: 'print3d',
      sampleMethodOther: '',
      goal: '',
      media: [], // zdjęcia do sekcji A
    },
    conditions: {
      setup: '',
      params: [], // { id, key, value }
    },
    points: [], // { id, description, result, comment, media: [] }
    overallResult: '',
    resultsMedia: [], // zdjęcia ogólne do sekcji C
    observations: '',
    observationsMedia: [], // zdjęcia do sekcji D
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

  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    upsert(report)
  }, [report])

  const updateHeader = (h) => setReport((r) => ({ ...r, header: h }))
  const setInfo = (k, v) => setReport((r) => ({ ...r, info: { ...r.info, [k]: v } }))
  const setCondField = (k, v) => setReport((r) => ({ ...r, conditions: { ...r.conditions, [k]: v } }))

  // params
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

  // points
  const addPoint = () => {
    setReport((r) => ({
      ...r,
      points: [...r.points, { id: newId(), description: '', result: 'ok', comment: '', media: [] }],
    }))
  }
  const updatePoint = (id, patch) => {
    setReport((r) => ({
      ...r,
      points: r.points.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }
  const removePoint = (id) => {
    setReport((r) => ({ ...r, points: r.points.filter((p) => p.id !== id) }))
  }

  const finishReport = () => {
    if (!window.confirm('Oznaczyć raport jako ukończony? Możesz go potem nadal edytować i pobrać PDF.')) return
    setReport((r) => ({ ...r, status: 'completed' }))
  }

  const downloadPdf = async () => {
    try { await generatePrototypePdf(report) }
    catch (e) { alert('Błąd generowania PDF: ' + e.message) }
  }

  // counters
  const okCount = report.points.filter((p) => p.result === 'ok').length
  const nokCount = report.points.filter((p) => p.result === 'nok').length
  const condCount = report.points.filter((p) => p.result === 'cond').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <span className="text-xs text-gray-500">
          Raport testów prototypu · Test #{report.info.iteration || 1}
        </span>
      </div>

      <Header header={report.header} onChange={updateHeader} reportType="prototype" />

      {/* A. Informacje o teście */}
      <div className="card">
        <h3 className="section-title">A. Informacje o teście</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Testowany podzespół</label>
            <input
              type="text" className="field-input"
              value={report.info.component}
              onChange={(e) => setInfo('component', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Numer iteracji (Test #)</label>
            <input
              type="number" min="1" className="field-input"
              value={report.info.iteration}
              onChange={(e) => setInfo('iteration', parseInt(e.target.value, 10) || 1)}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="field-label">Metoda wytworzenia próbki</label>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setInfo('sampleMethod', m.key)}
                className={
                  'px-4 py-3 rounded-lg text-sm border-2 transition flex-1 min-w-[140px] font-medium ' +
                  (report.info.sampleMethod === m.key
                    ? 'bg-sure-blue text-white border-transparent'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          {report.info.sampleMethod === 'other' && (
            <input
              type="text"
              className="field-input mt-2"
              placeholder="Opisz metodę…"
              value={report.info.sampleMethodOther}
              onChange={(e) => setInfo('sampleMethodOther', e.target.value)}
            />
          )}
        </div>
        <div className="mt-3">
          <label className="field-label">Cel testu</label>
          <textarea
            className="field-textarea"
            value={report.info.goal}
            onChange={(e) => setInfo('goal', e.target.value)}
            placeholder="Co chcemy zweryfikować tą iteracją?"
          />
        </div>
        <div className="mt-3">
          <label className="field-label">Zdjęcia (opcjonalne)</label>
          <MediaUploader
            photoOnly
            media={report.info.media || []}
            onChange={(m) => setInfo('media', m)}
          />
        </div>
      </div>

      {/* B. Warunki testu */}
      <div className="card">
        <h3 className="section-title">B. Warunki testu</h3>
        <div>
          <label className="field-label">Opis setupu testowego</label>
          <textarea
            className="field-textarea"
            value={report.conditions.setup}
            onChange={(e) => setCondField('setup', e.target.value)}
            placeholder="Jak zorganizowano test, jakie warunki, jakie urządzenia pomiarowe…"
          />
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="field-label mb-0">
              Parametry ({report.conditions.params.length}/{MAX_PARAMS})
            </label>
          </div>
          <div className="space-y-2">
            {report.conditions.params.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-6">{i + 1}.</span>
                <input
                  type="text" className="field-input flex-1"
                  placeholder="Parametr (np. Temperatura)"
                  value={p.key}
                  onChange={(e) => updateParam(p.id, { key: e.target.value })}
                />
                <input
                  type="text" className="field-input flex-1"
                  placeholder="Wartość (np. 180°C)"
                  value={p.value}
                  onChange={(e) => updateParam(p.id, { value: e.target.value })}
                />
                <button
                  onClick={() => removeParam(p.id)}
                  className="bg-red-600 hover:bg-red-700 text-white w-8 h-8 rounded-full text-sm flex items-center justify-center flex-shrink-0"
                  aria-label="Usuń parametr"
                >✕</button>
              </div>
            ))}
          </div>
          <button
            onClick={addParam}
            disabled={report.conditions.params.length >= MAX_PARAMS}
            className="mt-2 btn-secondary text-sm py-2 w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Dodaj parametr
          </button>
        </div>
      </div>

      {/* C. Wyniki testu */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title mb-0">C. Wyniki testu</h3>
          <span className="text-xs text-gray-500">
            {report.points.length > 0 && (
              <>✓ {okCount} · ✗ {nokCount} · ~ {condCount}</>
            )}
          </span>
        </div>
        <div className="space-y-3">
          {report.points.map((p, i) => (
            <div key={p.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">#{i + 1}</span>
                <input
                  type="text" className="field-input flex-1"
                  placeholder="Opis punktu kontrolnego"
                  value={p.description}
                  onChange={(e) => updatePoint(p.id, { description: e.target.value })}
                />
                <button
                  onClick={() => removePoint(p.id)}
                  className="bg-red-600 hover:bg-red-700 text-white w-8 h-8 rounded-full text-sm flex items-center justify-center flex-shrink-0"
                  aria-label="Usuń punkt"
                >✕</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {POINT_RESULTS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => updatePoint(p.id, { result: r.key })}
                    className={
                      'px-3 py-2 rounded-lg text-sm border-2 transition flex-1 min-w-[100px] font-medium ' +
                      (p.result === r.key ? r.active : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')
                    }
                  >
                    {r.icon} {r.label}
                  </button>
                ))}
              </div>
              <input
                type="text" className="field-input"
                placeholder="Komentarz (opcjonalny)"
                value={p.comment}
                onChange={(e) => updatePoint(p.id, { comment: e.target.value })}
              />
              <div>
                <label className="field-label">Zdjęcia (opcjonalne)</label>
                <MediaUploader
                  photoOnly
                  media={p.media || []}
                  onChange={(m) => updatePoint(p.id, { media: m })}
                />
              </div>
            </div>
          ))}
        </div>
        <button onClick={addPoint} className="mt-3 btn-secondary text-sm py-2 w-full">
          + Dodaj punkt
        </button>

        <div className="mt-4">
          <label className="field-label">Ogólna ocena testu</label>
          <div className="flex flex-wrap gap-2">
            {OVERALL_RESULTS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setReport((rep) => ({ ...rep, overallResult: r.key }))}
                className={
                  'px-4 py-3 rounded-lg text-sm border-2 transition flex-1 min-w-[160px] font-medium ' +
                  (report.overallResult === r.key
                    ? r.color + ' text-white border-transparent'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="field-label">Zdjęcia ogólne do wyników (opcjonalne)</label>
          <MediaUploader
            photoOnly
            media={report.resultsMedia || []}
            onChange={(m) => setReport((r) => ({ ...r, resultsMedia: m }))}
          />
        </div>
      </div>

      {/* D. Obserwacje i wnioski */}
      <div className="card">
        <h3 className="section-title">D. Obserwacje i wnioski</h3>
        <textarea
          className="field-textarea"
          value={report.observations}
          onChange={(e) => setReport((r) => ({ ...r, observations: e.target.value }))}
          placeholder="Co zauważyłeś, jakie hipotezy potwierdziły się / zostały obalone…"
        />
        <div className="mt-3">
          <label className="field-label">Zdjęcia (opcjonalne)</label>
          <MediaUploader
            photoOnly
            media={report.observationsMedia || []}
            onChange={(m) => setReport((r) => ({ ...r, observationsMedia: m }))}
          />
        </div>
      </div>

      {/* E. Decyzja */}
      <div className="card">
        <h3 className="section-title">E. Decyzja</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {DECISIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setReport((r) => ({ ...r, decision: d.key }))}
              className={
                'px-4 py-3 rounded-lg text-sm border-2 transition flex-1 min-w-[160px] font-medium ' +
                (report.decision === d.key
                  ? d.color + ' text-white border-transparent'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')
              }
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>
        <label className="field-label">Opis decyzji / kolejne kroki</label>
        <textarea
          className="field-textarea"
          value={report.decisionNotes}
          onChange={(e) => setReport((r) => ({ ...r, decisionNotes: e.target.value }))}
          placeholder="Co dokładnie zostanie zmienione w kolejnej iteracji / jak wdrożyć…"
        />
      </div>

      {/* F. Dokumentacja foto */}
      <div className="card">
        <h3 className="section-title">F. Dokumentacja fotograficzna</h3>
        <p className="text-sm text-gray-500 mb-3">
          Zdjęcia / wideo do całego testu (nieprzypisane do konkretnego punktu).
        </p>
        <MediaUploader
          media={report.media}
          onChange={(m) => setReport((r) => ({ ...r, media: m }))}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {report.status !== 'completed' && (
          <button onClick={finishReport} className="btn-success flex-1">
            ✓ Oznacz jako ukończony
          </button>
        )}
        <button onClick={downloadPdf} className="btn-primary flex-1">📄 Pobierz PDF</button>
        <button onClick={() => navigate('')} className="btn-secondary flex-1">Zapisz i wyjdź</button>
      </div>
    </div>
  )
}
