import { useEffect, useRef, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import { upsert, getById, newId } from '../../utils/storage.js'
import { generateServicePdf } from '../../utils/pdfGenerator.js'

const CATEGORIES = ['Mechanika', 'Elektryka', 'Pneumatyka', 'Hydraulika', 'Software', 'Inne']

const PRIORITIES = [
  { key: 'urgent', label: 'Pilne', icon: '🔴', color: 'bg-red-100 text-red-700 border-red-300' },
  { key: 'planned', label: 'Planowe', icon: '🟡', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { key: 'watch', label: 'Obserwacja', icon: '🟢', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
]

const STATUSES = [
  { key: 'completed', label: 'Zakończona', icon: '✓', color: 'bg-emerald-600' },
  { key: 'followup', label: 'Wymaga follow-up', icon: '⏳', color: 'bg-amber-500' },
  { key: 'parts', label: 'Oczekuje na części', icon: '🔧', color: 'bg-sure-blue' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()

function defaultReport() {
  return {
    id: newId(),
    type: 'service',
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
    visit: {
      client: '',
      location: '',
      arrival: '',
      departure: '',
    },
    actions: [], // { id, description, category, media: [] }
    parts: [],   // { id, name, catalogNo, priority, comment }
    observations: '',
    recommendations: '',
    visitStatus: 'completed', // completed | followup | parts
    media: [],
  }
}

export default function ServiceReport({ navigate, reportId }) {
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
  const updateVisit = (k, v) => setReport((r) => ({ ...r, visit: { ...r.visit, [k]: v } }))

  // ===== actions =====
  const addAction = () => {
    setReport((r) => ({
      ...r,
      actions: [...r.actions, { id: newId(), description: '', category: CATEGORIES[0], media: [] }],
    }))
  }
  const updateAction = (id, patch) => {
    setReport((r) => ({
      ...r,
      actions: r.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }))
  }
  const removeAction = (id) => {
    setReport((r) => ({ ...r, actions: r.actions.filter((a) => a.id !== id) }))
  }

  // ===== parts =====
  const addPart = () => {
    setReport((r) => ({
      ...r,
      parts: [...r.parts, { id: newId(), name: '', catalogNo: '', priority: 'planned', comment: '' }],
    }))
  }
  const updatePart = (id, patch) => {
    setReport((r) => ({
      ...r,
      parts: r.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }
  const removePart = (id) => {
    setReport((r) => ({ ...r, parts: r.parts.filter((p) => p.id !== id) }))
  }

  const finishReport = () => {
    if (!window.confirm('Oznaczyć raport jako ukończony? Możesz go potem wciąż edytować i pobrać PDF.')) return
    setReport((r) => ({ ...r, status: 'completed' }))
  }

  const downloadPdf = async () => {
    try { await generateServicePdf(report) }
    catch (e) { alert('Błąd generowania PDF: ' + e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <span className="text-xs text-gray-500">Raport serwisu na obiekcie</span>
      </div>

      <Header header={report.header} onChange={updateHeader} reportType="service" />

      {/* A. Dane wizyty */}
      <div className="card">
        <h3 className="section-title">A. Dane wizyty</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Nazwa klienta</label>
            <input
              type="text" className="field-input"
              value={report.visit.client}
              onChange={(e) => updateVisit('client', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Lokalizacja / adres obiektu</label>
            <input
              type="text" className="field-input"
              value={report.visit.location}
              onChange={(e) => updateVisit('location', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Godzina przyjazdu</label>
            <input
              type="time" className="field-input"
              value={report.visit.arrival}
              onChange={(e) => updateVisit('arrival', e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Godzina odjazdu</label>
            <input
              type="time" className="field-input"
              value={report.visit.departure}
              onChange={(e) => updateVisit('departure', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* B. Wykonane czynności */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title mb-0">B. Wykonane czynności</h3>
          <span className="text-xs text-gray-500">{report.actions.length}</span>
        </div>
        <div className="space-y-3">
          {report.actions.map((a, i) => (
            <div key={a.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">#{i + 1}</span>
                <select
                  className="field-input flex-1"
                  value={a.category}
                  onChange={(e) => updateAction(a.id, { category: e.target.value })}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  onClick={() => removeAction(a.id)}
                  className="bg-red-600 hover:bg-red-700 text-white w-8 h-8 rounded-full text-sm flex items-center justify-center flex-shrink-0"
                  aria-label="Usuń czynność"
                >✕</button>
              </div>
              <textarea
                className="field-textarea"
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
          ))}
        </div>
        <button onClick={addAction} className="mt-3 btn-secondary text-sm py-2 w-full">
          + Dodaj czynność
        </button>
      </div>

      {/* C. Elementy do wymiany / uwagi */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title mb-0">C. Elementy do wymiany / uwagi</h3>
          <span className="text-xs text-gray-500">{report.parts.length}</span>
        </div>
        <div className="space-y-3">
          {report.parts.map((p, i) => (
            <div key={p.id} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">#{i + 1}</span>
                <input
                  type="text" className="field-input flex-1"
                  placeholder="Nazwa elementu"
                  value={p.name}
                  onChange={(e) => updatePart(p.id, { name: e.target.value })}
                />
                <button
                  onClick={() => removePart(p.id)}
                  className="bg-red-600 hover:bg-red-700 text-white w-8 h-8 rounded-full text-sm flex items-center justify-center flex-shrink-0"
                  aria-label="Usuń element"
                >✕</button>
              </div>
              <input
                type="text" className="field-input"
                placeholder="Numer katalogowy (opcjonalny)"
                value={p.catalogNo}
                onChange={(e) => updatePart(p.id, { catalogNo: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {PRIORITIES.map((pr) => (
                  <button
                    key={pr.key}
                    type="button"
                    onClick={() => updatePart(p.id, { priority: pr.key })}
                    className={
                      'px-3 py-2 rounded-lg text-sm border-2 transition flex-1 min-w-[110px] ' +
                      (p.priority === pr.key
                        ? pr.color + ' border-current font-semibold'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')
                    }
                  >
                    {pr.icon} {pr.label}
                  </button>
                ))}
              </div>
              <input
                type="text" className="field-input"
                placeholder="Komentarz (opcjonalny)"
                value={p.comment}
                onChange={(e) => updatePart(p.id, { comment: e.target.value })}
              />
            </div>
          ))}
        </div>
        <button onClick={addPart} className="mt-3 btn-secondary text-sm py-2 w-full">
          + Dodaj element
        </button>
      </div>

      {/* D. Obserwacje */}
      <div className="card">
        <h3 className="section-title">D. Obserwacje własne</h3>
        <textarea
          className="field-textarea"
          value={report.observations}
          onChange={(e) => setReport((r) => ({ ...r, observations: e.target.value }))}
          placeholder="Co zauważyłeś podczas wizyty?"
        />
      </div>

      {/* E. Rekomendacje */}
      <div className="card">
        <h3 className="section-title">E. Rekomendacje</h3>
        <textarea
          className="field-textarea"
          value={report.recommendations}
          onChange={(e) => setReport((r) => ({ ...r, recommendations: e.target.value }))}
          placeholder="Co rekomendujesz klientowi / dalsze kroki…"
        />
      </div>

      {/* F. Status wizyty */}
      <div className="card">
        <h3 className="section-title">F. Status wizyty</h3>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setReport((r) => ({ ...r, visitStatus: s.key }))}
              className={
                'px-4 py-3 rounded-lg text-sm border-2 transition flex-1 min-w-[160px] font-medium ' +
                (report.visitStatus === s.key
                  ? s.color + ' text-white border-transparent'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400')
              }
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* G. Dokumentacja foto */}
      <div className="card">
        <h3 className="section-title">G. Dokumentacja fotograficzna</h3>
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
