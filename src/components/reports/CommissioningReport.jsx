import { useEffect, useMemo, useRef, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import { upsert, getById, newId } from '../../utils/storage.js'
import { generateCommissioningPdf } from '../../utils/pdfGenerator.js'

const STOP_REASONS = [
  'Zacięcie detalu',
  'Błąd programu',
  'Alarm bezpieczeństwa',
  'Regulacja',
  'Awaria mechaniczna',
  'Inne',
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()
const timeHHMM = (iso) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(ms) {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDurationShort(ms) {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s} s`
  return `${m} min ${s} s`
}

function defaultReport() {
  return {
    id: newId(),
    type: 'commissioning',
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
    phase: 'setup', // setup | running | stopped | finished
    sessionStartAt: null,
    sessionEndAt: null,
    activeStop: null, // { startAt }
    stops: [], // { id, startAt, endAt, durationMs, reason, customReason, comment, media: [] }
    observations: '',
    conclusions: '',
    generalMedia: [], // ogólna dokumentacja foto/video w Fazie 3
  }
}

export default function CommissioningReport({ navigate, reportId }) {
  const [report, setReport] = useState(() => {
    if (reportId) {
      const existing = getById(reportId)
      if (existing) return existing
    }
    return defaultReport()
  })

  // tick for live timer rendering
  const [, setTick] = useState(0)
  useEffect(() => {
    if (report.phase !== 'running' && report.phase !== 'stopped') return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [report.phase])

  // auto-save on every change
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    upsert(report)
  }, [report])

  const updateHeader = (h) => setReport((r) => ({ ...r, header: h }))

  // ==== PHASE 1: START ====
  const canStart = useMemo(() => {
    const h = report.header
    return !!(h.reportNumber && h.projectName && h.machineName && h.date && h.author)
  }, [report.header])

  const startSession = () => {
    if (!canStart) {
      alert('Uzupełnij wszystkie pola nagłówka przed startem.')
      return
    }
    setReport((r) => ({
      ...r,
      phase: 'running',
      sessionStartAt: nowISO(),
    }))
  }

  // ==== PHASE 2: STOPPAGE LOG ====
  const [stopModal, setStopModal] = useState(null) // { reason, customReason, comment }

  const openStop = () => {
    setReport((r) => ({
      ...r,
      phase: 'stopped',
      activeStop: { startAt: nowISO() },
    }))
    setStopModal({ reason: STOP_REASONS[0], customReason: '', comment: '', media: [] })
  }

  const cancelStop = () => {
    // user changed mind — discard active stop
    setReport((r) => ({ ...r, phase: 'running', activeStop: null }))
    setStopModal(null)
  }

  const saveStopAndResume = () => {
    const startAt = report.activeStop.startAt
    const endAt = nowISO()
    const durationMs = new Date(endAt) - new Date(startAt)
    const stop = {
      id: newId(),
      startAt,
      endAt,
      durationMs,
      reason: stopModal.reason,
      customReason: stopModal.reason === 'Inne' ? stopModal.customReason : '',
      comment: stopModal.comment,
      media: stopModal.media || [],
    }
    setReport((r) => ({
      ...r,
      phase: 'running',
      activeStop: null,
      stops: [...r.stops, stop],
    }))
    setStopModal(null)
  }

  // ==== PHASE 3: FINISH ====
  const finishSession = () => {
    if (!window.confirm('Zakończyć sesję? Po zakończeniu nie można dodawać kolejnych zatrzymań.')) return
    setReport((r) => ({
      ...r,
      phase: 'finished',
      sessionEndAt: nowISO(),
      status: 'completed',
    }))
  }

  // ==== STATS ====
  const stats = useMemo(() => {
    const start = report.sessionStartAt ? new Date(report.sessionStartAt) : null
    const end = report.sessionEndAt ? new Date(report.sessionEndAt) : new Date()
    const totalRunMs = start ? end - start : 0
    const totalStopMs = report.stops.reduce((s, st) => s + (st.durationMs || 0), 0)
    const longestStop = report.stops.reduce((m, st) => Math.max(m, st.durationMs || 0), 0)
    return {
      totalRunMs,
      totalStopMs,
      stopCount: report.stops.length,
      longestStop,
    }
  }, [report.sessionStartAt, report.sessionEndAt, report.stops])

  // live timer
  const liveMs = report.sessionStartAt
    ? (new Date(report.sessionEndAt || Date.now()) - new Date(report.sessionStartAt))
    : 0

  const activeStopMs = report.activeStop
    ? (Date.now() - new Date(report.activeStop.startAt))
    : 0

  const downloadPdf = async () => {
    try { await generateCommissioningPdf(report) }
    catch (e) { alert('Błąd generowania PDF: ' + e.message) }
  }

  // ============ RENDER ============
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <div className="text-xs text-gray-500">
          {report.phase === 'setup' && 'Faza 1: Start sesji'}
          {report.phase === 'running' && 'Faza 2: Logowanie na żywo'}
          {report.phase === 'stopped' && 'Faza 2: Zatrzymanie maszyny'}
          {report.phase === 'finished' && 'Faza 3: Podsumowanie'}
        </div>
      </div>

      {/* FAZA 1 */}
      {report.phase === 'setup' && (
        <>
          <Header header={report.header} onChange={updateHeader} reportType="commissioning" />
          <div className="card text-center">
            <p className="text-gray-600 mb-4">
              Po uzupełnieniu nagłówka kliknij <strong>START MASZYNY</strong> — uruchomi się timer
              i będziesz mógł logować zatrzymania na żywo.
            </p>
            <button
              onClick={startSession}
              disabled={!canStart}
              className={
                'w-full text-2xl font-bold py-8 rounded-xl shadow-lg transition ' +
                (canStart
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98]'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed')
              }
            >
              ▶ START MASZYNY
            </button>
            {!canStart && (
              <p className="text-sm text-amber-600 mt-3">Uzupełnij wszystkie pola nagłówka.</p>
            )}
          </div>
        </>
      )}

      {/* FAZA 2 — live */}
      {(report.phase === 'running' || report.phase === 'stopped') && (
        <>
          {/* Big timer */}
          <div className={
            'rounded-xl shadow-lg p-6 text-center sticky top-16 z-20 ' +
            (report.phase === 'stopped' ? 'bg-red-600 text-white' : 'bg-sure-dark text-white')
          }>
            <div className="text-xs uppercase tracking-wider opacity-80">
              {report.phase === 'stopped' ? 'MASZYNA ZATRZYMANA' : 'Czas pracy maszyny'}
            </div>
            <div className="font-mono text-5xl sm:text-6xl font-bold mt-1 tabular-nums">
              {formatDuration(liveMs)}
            </div>
            {report.phase === 'stopped' && (
              <div className="mt-2 text-sm opacity-90">
                Bieżące zatrzymanie: {formatDurationShort(activeStopMs)}
              </div>
            )}
          </div>

          {/* Main action */}
          {report.phase === 'running' && (
            <button
              onClick={openStop}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-2xl py-8 rounded-xl shadow-lg active:scale-[0.98] transition"
            >
              ⏸ ZATRZYMANIE MASZYNY
            </button>
          )}

          {/* Stops log */}
          <div className="card">
            <h3 className="section-title">Log zatrzymań ({report.stops.length})</h3>
            {report.stops.length === 0 ? (
              <p className="text-sm text-gray-500">Brak zatrzymań — maszyna pracuje bez przestojów.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Godzina</th>
                      <th className="py-2 pr-2">Czas</th>
                      <th className="py-2 pr-2">Powód</th>
                      <th className="py-2 pr-2">Komentarz</th>
                      <th className="py-2 pr-2">Media</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.stops.map((s, i) => {
                      const photos = (s.media || []).filter((m) => m.kind === 'image').length
                      const videos = (s.media || []).filter((m) => m.kind === 'video').length
                      return (
                        <tr key={s.id} className="border-t border-gray-100">
                          <td className="py-2 pr-2 font-semibold">{i + 1}</td>
                          <td className="py-2 pr-2 tabular-nums">{timeHHMM(s.startAt)}</td>
                          <td className="py-2 pr-2 tabular-nums">{formatDurationShort(s.durationMs)}</td>
                          <td className="py-2 pr-2">
                            {s.reason === 'Inne' && s.customReason ? s.customReason : s.reason}
                          </td>
                          <td className="py-2 pr-2 text-gray-600">{s.comment || '—'}</td>
                          <td className="py-2 pr-2 text-gray-600 whitespace-nowrap">
                            {photos === 0 && videos === 0 ? '—' : (
                              <span>
                                {photos > 0 && <span>📷 {photos}</span>}
                                {photos > 0 && videos > 0 && <span> · </span>}
                                {videos > 0 && <span>🎬 {videos}</span>}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Finish */}
          {report.phase === 'running' && (
            <button
              onClick={finishSession}
              className="w-full btn-secondary text-base py-4 border-2 border-sure-dark"
            >
              ⏹ STOP — ZAKOŃCZ SESJĘ
            </button>
          )}

          {/* Stop modal */}
          {stopModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
                <div>
                  <h3 className="text-lg font-bold">Zatrzymanie maszyny</h3>
                  <p className="text-sm text-gray-600">
                    Godzina: <span className="font-mono">{timeHHMM(report.activeStop.startAt)}</span>
                    {' · Trwa: '}
                    <span className="font-mono">{formatDurationShort(activeStopMs)}</span>
                  </p>
                </div>
                <div>
                  <label className="field-label">Powód zatrzymania</label>
                  <select
                    className="field-input"
                    value={stopModal.reason}
                    onChange={(e) => setStopModal({ ...stopModal, reason: e.target.value })}
                  >
                    {STOP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {stopModal.reason === 'Inne' && (
                  <div>
                    <label className="field-label">Opisz powód</label>
                    <input
                      type="text"
                      className="field-input"
                      value={stopModal.customReason}
                      onChange={(e) => setStopModal({ ...stopModal, customReason: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label className="field-label">Komentarz</label>
                  <textarea
                    className="field-textarea"
                    value={stopModal.comment}
                    onChange={(e) => setStopModal({ ...stopModal, comment: e.target.value })}
                    placeholder="Krótki opis sytuacji…"
                  />
                </div>
                <div>
                  <label className="field-label">Dokumentacja foto / wideo</label>
                  <MediaUploader
                    media={stopModal.media}
                    onChange={(m) => setStopModal({ ...stopModal, media: m })}
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={cancelStop} className="btn-secondary flex-1">
                    Anuluj zatrzymanie
                  </button>
                  <button onClick={saveStopAndResume} className="btn-success flex-1">
                    Zapisz i wznów maszynę
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* FAZA 3 */}
      {report.phase === 'finished' && (
        <>
          <div className="card bg-sure-dark text-white">
            <h3 className="text-lg font-semibold mb-4">Podsumowanie sesji</h3>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Całkowity czas pracy" value={formatDuration(stats.totalRunMs)} mono />
              <Stat label="Liczba zatrzymań" value={String(stats.stopCount)} />
              <Stat label="Łączny czas przestojów" value={formatDurationShort(stats.totalStopMs)} />
              <Stat label="Najdłuższe zatrzymanie" value={formatDurationShort(stats.longestStop)} />
            </div>
          </div>

          <Header header={report.header} onChange={updateHeader} reportType="commissioning" />

          {report.stops.length > 0 && (
            <div className="card">
              <h3 className="section-title">Log zatrzymań ({report.stops.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Godzina</th>
                      <th className="py-2 pr-2">Czas</th>
                      <th className="py-2 pr-2">Powód</th>
                      <th className="py-2 pr-2">Komentarz</th>
                      <th className="py-2 pr-2">Media</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.stops.map((s, i) => {
                      const photos = (s.media || []).filter((m) => m.kind === 'image').length
                      const videos = (s.media || []).filter((m) => m.kind === 'video').length
                      return (
                        <tr key={s.id} className="border-t border-gray-100">
                          <td className="py-2 pr-2 font-semibold">{i + 1}</td>
                          <td className="py-2 pr-2 tabular-nums">{timeHHMM(s.startAt)}</td>
                          <td className="py-2 pr-2 tabular-nums">{formatDurationShort(s.durationMs)}</td>
                          <td className="py-2 pr-2">
                            {s.reason === 'Inne' && s.customReason ? s.customReason : s.reason}
                          </td>
                          <td className="py-2 pr-2 text-gray-600">{s.comment || '—'}</td>
                          <td className="py-2 pr-2 text-gray-600 whitespace-nowrap">
                            {photos === 0 && videos === 0 ? '—' : (
                              <span>
                                {photos > 0 && <span>📷 {photos}</span>}
                                {photos > 0 && videos > 0 && <span> · </span>}
                                {videos > 0 && <span>🎬 {videos}</span>}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <h3 className="section-title">Obserwacje ogólne</h3>
            <textarea
              className="field-textarea"
              value={report.observations}
              onChange={(e) => setReport((r) => ({ ...r, observations: e.target.value }))}
              placeholder="Co zauważyłeś podczas obserwacji maszyny?"
            />
          </div>

          <div className="card">
            <h3 className="section-title">Wnioski i rekomendacje</h3>
            <textarea
              className="field-textarea"
              value={report.conclusions}
              onChange={(e) => setReport((r) => ({ ...r, conclusions: e.target.value }))}
              placeholder="Wnioski, propozycje usprawnień, dalsze kroki…"
            />
          </div>

          <div className="card">
            <h3 className="section-title">Dokumentacja fotograficzna (ogólna)</h3>
            <p className="text-sm text-gray-500 mb-3">
              Zdjęcia / wideo nieprzypisane do konkretnego zatrzymania.
            </p>
            <MediaUploader
              media={report.generalMedia || []}
              onChange={(m) => setReport((r) => ({ ...r, generalMedia: m }))}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={downloadPdf} className="btn-primary flex-1">📄 Pobierz PDF</button>
            <button onClick={() => navigate('')} className="btn-secondary flex-1">Zapisz i wyjdź</button>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className={'mt-1 text-2xl font-bold ' + (mono ? 'font-mono tabular-nums' : '')}>{value}</div>
    </div>
  )
}
