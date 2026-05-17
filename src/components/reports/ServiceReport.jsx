import { useEffect, useRef, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import SectionNav from '../common/SectionNav.jsx'
import EmptyState from '../common/EmptyState.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import { useToast, useConfirm } from '../common/Toast.jsx'
import { upsert, getById, newId } from '../../utils/storage.js'
import { generateServicePackage } from '../../utils/pdfGenerator.js'

const CATEGORIES = ['Mechanika', 'Elektryka', 'Pneumatyka', 'Hydraulika', 'Software', 'Inne']

const PRIORITY_ITEMS = [
  { key: 'urgent',  label: 'Pilne',      icon: '🔴', activeClass: 'bg-red-100 text-red-700 border-red-400 font-semibold' },
  { key: 'planned', label: 'Planowe',    icon: '🟡', activeClass: 'bg-amber-100 text-amber-800 border-amber-400 font-semibold' },
  { key: 'watch',   label: 'Obserwacja', icon: '🟢', activeClass: 'bg-emerald-100 text-emerald-700 border-emerald-400 font-semibold' },
]

const STATUS_ITEMS = [
  { key: 'completed', label: 'Zakończona',         icon: '✓', activeClass: 'bg-emerald-600 text-white border-transparent' },
  { key: 'followup',  label: 'Wymaga follow-up',   icon: '⏳', activeClass: 'bg-amber-500 text-white border-transparent' },
  { key: 'parts',     label: 'Oczekuje na części', icon: '🔧', activeClass: 'bg-sure-blue text-white border-transparent' },
]

const SECTIONS = [
  { id: 'sec-header',  label: 'Nagłówek' },
  { id: 'sec-a',       label: 'A. Wizyta' },
  { id: 'sec-b',       label: 'B. Czynności' },
  { id: 'sec-c',       label: 'C. Części' },
  { id: 'sec-d',       label: 'D. Obserwacje' },
  { id: 'sec-e',       label: 'E. Rekomendacje' },
  { id: 'sec-f',       label: 'F. Status' },
  { id: 'sec-g',       label: 'G. Foto' },
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
    visit: { client: '', location: '', arrival: '', departure: '' },
    actions: [],
    parts: [],
    observations: '',
    recommendations: '',
    visitStatus: 'completed',
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

  const toast = useToast()
  const confirm = useConfirm()
  const [savedAt, setSavedAt] = useState(null)
  const [downloading, setDownloading] = useState(false)

  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    upsert(report)
    setSavedAt(Date.now())
  }, [report])

  const updateHeader = (h) => setReport((r) => ({ ...r, header: h }))
  const updateVisit = (k, v) => setReport((r) => ({ ...r, visit: { ...r.visit, [k]: v } }))

  const addAction = () => {
    setReport((r) => ({
      ...r,
      actions: [...r.actions, { id: newId(), description: '', category: CATEGORIES[0], media: [] }],
    }))
  }
  const updateAction = (id, patch) => {
    setReport((r) => ({ ...r, actions: r.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }))
  }
  const removeAction = async (id) => {
    if (!(await confirm('Usunąć tę czynność?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({ ...r, actions: r.actions.filter((a) => a.id !== id) }))
  }

  const addPart = () => {
    setReport((r) => ({
      ...r,
      parts: [...r.parts, { id: newId(), name: '', catalogNo: '', priority: 'planned', comment: '' }],
    }))
  }
  const updatePart = (id, patch) => {
    setReport((r) => ({ ...r, parts: r.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }
  const removePart = async (id) => {
    if (!(await confirm('Usunąć ten element?', { variant: 'danger', confirmLabel: 'Usuń' }))) return
    setReport((r) => ({ ...r, parts: r.parts.filter((p) => p.id !== id) }))
  }

  const finishReport = async () => {
    if (!(await confirm('Oznaczyć raport jako ukończony? Możesz go potem wciąż edytować i pobrać paczkę.', {
      confirmLabel: 'Oznacz', title: 'Zakończenie raportu'
    }))) return
    setReport((r) => ({ ...r, status: 'completed' }))
    toast.success('Raport oznaczony jako ukończony')
  }

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await generateServicePackage(report)
      toast.success('Paczka pobrana')
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <AutoSaveIndicator savedAt={savedAt} />
      </div>

      <SectionNav sections={SECTIONS} />

      <div id="sec-header">
        <Header header={report.header} onChange={updateHeader} reportType="service" />
      </div>

      <div id="sec-a" className="card">
        <h3 className="section-title">A. Dane wizyty</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Nazwa klienta</label>
            <input type="text" className="field-input"
              value={report.visit.client}
              onChange={(e) => updateVisit('client', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Lokalizacja / adres obiektu</label>
            <input type="text" className="field-input"
              value={report.visit.location}
              onChange={(e) => updateVisit('location', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Godzina przyjazdu</label>
            <input type="time" className="field-input"
              value={report.visit.arrival}
              onChange={(e) => updateVisit('arrival', e.target.value)} />
          </div>
          <div>
            <label className="field-label">Godzina odjazdu</label>
            <input type="time" className="field-input"
              value={report.visit.departure}
              onChange={(e) => updateVisit('departure', e.target.value)} />
          </div>
        </div>
      </div>

      <div id="sec-b" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-sure-dark mb-0">B. Wykonane czynności</h3>
          <span className="text-xs text-gray-500">{report.actions.length}</span>
        </div>
        <div className="space-y-3">
          {report.actions.length === 0 && (
            <EmptyState
              icon="🛠️"
              title="Brak czynności"
              hint={'Kliknij „+ Dodaj czynność" poniżej aby dodać pierwszą.'}
            />
          )}
          {report.actions.map((a, i) => (
            <div key={a.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="index-badge">{i + 1}</span>
                <select
                  className="field-input flex-1"
                  value={a.category}
                  onChange={(e) => updateAction(a.id, { category: e.target.value })}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
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
          ))}
        </div>
        <button onClick={addAction} className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 w-full">
          + Dodaj czynność
        </button>
      </div>

      <div id="sec-c" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-sure-dark mb-0">C. Elementy do wymiany / uwagi</h3>
          <span className="text-xs text-gray-500">{report.parts.length}</span>
        </div>
        <div className="space-y-3">
          {report.parts.length === 0 && (
            <EmptyState
              icon="🔩"
              title="Brak elementów"
              hint="Dodaj części wymagające wymiany lub punkty wymagające obserwacji."
            />
          )}
          {report.parts.map((p, i) => (
            <div key={p.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="index-badge">{i + 1}</span>
                <input type="text" className="field-input flex-1"
                  placeholder="Nazwa elementu"
                  value={p.name}
                  onChange={(e) => updatePart(p.id, { name: e.target.value })} />
                <button
                  onClick={() => removePart(p.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń element"
                >✕</button>
              </div>
              <input type="text" className="field-input"
                placeholder="Numer katalogowy (opcjonalny)"
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
            </div>
          ))}
        </div>
        <button onClick={addPart} className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 w-full">
          + Dodaj element
        </button>
      </div>

      <div id="sec-d" className="card">
        <h3 className="section-title">D. Obserwacje własne</h3>
        <MicTextarea
          value={report.observations}
          onChange={(e) => setReport((r) => ({ ...r, observations: e.target.value }))}
          placeholder="Co zauważyłeś podczas wizyty?"
        />
      </div>

      <div id="sec-e" className="card">
        <h3 className="section-title">E. Rekomendacje</h3>
        <MicTextarea
          value={report.recommendations}
          onChange={(e) => setReport((r) => ({ ...r, recommendations: e.target.value }))}
          placeholder="Co rekomendujesz klientowi / dalsze kroki…"
        />
      </div>

      <div id="sec-f" className="card">
        <h3 className="section-title">F. Status wizyty</h3>
        <ToggleGroup
          items={STATUS_ITEMS}
          value={report.visitStatus}
          onChange={(k) => setReport((r) => ({ ...r, visitStatus: k }))}
        />
      </div>

      <div id="sec-g" className="card">
        <h3 className="section-title">G. Dokumentacja fotograficzna</h3>
        <MediaUploader
          media={report.media}
          onChange={(m) => setReport((r) => ({ ...r, media: m }))}
        />
      </div>

      {/* Sticky action bar */}
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
          <button onClick={() => navigate('')} className="btn-secondary flex-1">
            Zapisz i wyjdź
          </button>
        </div>
      </div>
    </div>
  )
}
