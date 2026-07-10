import { useEffect, useMemo, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import ReportActionBar from '../common/ReportActionBar.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import { getById, newId } from '../../utils/storage.js'
import { useReportPage } from '../../utils/useReportPage.js'
import { buildCommissioningPackage, buildCommissioningPdf } from '../../utils/pdfGenerator.js'
import { deleteImage, deleteVideo, deleteOriginal } from '../../utils/imageStore.js'

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

// Ustawia porę dnia (HH:MM) na istniejącej dacie rekordu, zachowując dzień.
// Używane przy ręcznej korekcie godziny rozpoczęcia zatrzymania w trybie edycji.
function setTimeOnISO(iso, hhmm) {
  const [hh, mm] = (hhmm || '00:00').split(':').map((n) => parseInt(n, 10) || 0)
  const d = iso ? new Date(iso) : new Date()
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
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

// Auto-generacja numeru raportu z numeru projektu i daty — jak w raporcie
// serwisowym (tam prefiks RPT-). Uruchomienie ma własny prefiks URU-, żeby
// nie mylić dokumentów. Pusty numer projektu → pusty numer raportu.
function computeReportNumber(projectNumber, date) {
  const pn = (projectNumber || '').trim()
  if (!pn) return ''
  return `URU-${pn}-${date || ''}`
}

function defaultReport() {
  return {
    id: newId(),
    type: 'commissioning',
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    header: {
      projectNumber: '',   // numer projektu (wpisywany) — jak w raporcie serwisowym
      reportNumber: '',     // auto: URU-{projectNumber}-{date}
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

  const [attemptedStart, setAttemptedStart] = useState(false)

  // Wspólny szkielet strony raportu (auto-save, paczki). Uruchomienie NIE
  // używa locka ukończonych — obserwacje/wnioski i edycja zatrzymań muszą
  // pozostać dostępne także po zakończeniu sesji, a blokada odcięłaby te pola.
  const page = useReportPage({ report, setReport, buildPackage: buildCommissioningPackage, buildPdf: buildCommissioningPdf })
  const { toast, confirm } = page

  // Numer raportu liczony automatycznie z numeru projektu + daty (jak w serwisie).
  // Gdy numer projektu pusty, zachowujemy ewentualny ręczny numer starszych
  // raportów (sprzed tej zmiany), by ich nie skasować.
  const updateHeader = (h) => setReport((r) => ({
    ...r,
    header: {
      ...h,
      reportNumber: (h.projectNumber || '').trim()
        ? computeReportNumber(h.projectNumber, h.date)
        : h.reportNumber,
    },
  }))

  // ==== PHASE 1: START ====
  const canStart = useMemo(() => {
    const h = report.header
    return !!(h.reportNumber && h.projectName && h.machineName && h.date && h.author)
  }, [report.header])

  const startSession = () => {
    if (!canStart) {
      setAttemptedStart(true)
      toast.error('Uzupełnij wszystkie pola nagłówka oznaczone *')
      return
    }
    setReport((r) => ({
      ...r,
      phase: 'running',
      sessionStartAt: nowISO(),
    }))
  }

  // ==== PHASE 2: STOPPAGE LOG (tworzenie nowego zatrzymania na żywo) ====
  const [stopModal, setStopModal] = useState(null) // { reason, customReason, comment, media }

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

  // ==== EDYCJA istniejącego zatrzymania ====
  // Edycja działa "na żywo" (każda zmiana auto-zapisywana), spójnie z resztą
  // aplikacji. Dzięki temu MediaUploader operuje wprost na rekordzie — nie ma
  // rozjazdu draft/commit ani osieroconych blobów przy "Anuluj".
  const [editStopId, setEditStopId] = useState(null)
  const editStop = (report.stops || []).find((s) => s.id === editStopId) || null

  const patchStop = (id, patch) =>
    setReport((r) => ({
      ...r,
      stops: (r.stops || []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))

  // Korekta godziny rozpoczęcia: zachowujemy czas trwania, przeliczamy koniec.
  const patchStopStart = (id, hhmm) =>
    setReport((r) => ({
      ...r,
      stops: (r.stops || []).map((s) => {
        if (s.id !== id) return s
        const startAt = setTimeOnISO(s.startAt, hhmm)
        const endAt = new Date(new Date(startAt).getTime() + (s.durationMs || 0)).toISOString()
        return { ...s, startAt, endAt }
      }),
    }))

  // Korekta czasu trwania: zachowujemy start, przeliczamy koniec.
  const patchStopDuration = (id, durationMs) =>
    setReport((r) => ({
      ...r,
      stops: (r.stops || []).map((s) => {
        if (s.id !== id) return s
        const endAt = new Date(new Date(s.startAt).getTime() + durationMs).toISOString()
        return { ...s, durationMs, endAt }
      }),
    }))

  const deleteStop = async (id) => {
    if (!(await confirm('Usunąć ten rekord zatrzymania? Tej operacji nie można cofnąć.', {
      title: 'Usuń zatrzymanie', confirmLabel: 'Usuń', variant: 'danger'
    }))) return
    const s = (report.stops || []).find((x) => x.id === id)
    // best-effort sprzątanie blobów w IndexedDB, żeby nie zostawiać śmieci
    ;(s?.media || []).forEach((m) => {
      if (m.photoId) deleteImage(m.photoId).catch(() => {})
      if (m.originalId) deleteOriginal(m.originalId).catch(() => {})
      if (m.videoId) deleteVideo(m.videoId).catch(() => {})
    })
    setReport((r) => ({ ...r, stops: (r.stops || []).filter((x) => x.id !== id) }))
    setEditStopId(null)
    toast.success('Zatrzymanie usunięte')
  }

  // ==== PHASE 3: FINISH ====
  const finishSession = async () => {
    if (!(await confirm('Zakończyć sesję? Po zakończeniu nie można dodawać kolejnych zatrzymań (obserwacje, wnioski i edycję rekordów możesz nadal uzupełniać).', {
      title: 'Zakończenie sesji', confirmLabel: 'Zakończ', variant: 'danger'
    }))) return
    setReport((r) => ({
      ...r,
      phase: 'finished',
      sessionEndAt: nowISO(),
      status: 'completed',
    }))
    toast.success('Sesja zakończona')
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

  // ============ RENDER ============
  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <div className="flex items-center gap-3">
          <AutoSaveIndicator savedAt={page.savedAt} />
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {report.phase === 'setup' && 'Faza 1: Start sesji'}
            {report.phase === 'running' && 'Faza 2: Logowanie na żywo'}
            {report.phase === 'stopped' && 'Faza 2: Zatrzymanie maszyny'}
            {report.phase === 'finished' && 'Faza 3: Podsumowanie'}
          </div>
        </div>
      </div>

      {/* FAZA 1 */}
      {report.phase === 'setup' && (
        <>
          <Header
            header={report.header}
            onChange={updateHeader}
            reportType="commissioning"
            showErrors={attemptedStart}
          />
          <div className="card text-center">
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Po uzupełnieniu nagłówka kliknij <strong>START MASZYNY</strong> — uruchomi się timer
              i będziesz mógł logować zatrzymania na żywo.
            </p>
            <button
              onClick={startSession}
              className={
                'w-full text-2xl font-bold py-8 rounded-xl shadow-lg transition ' +
                (canStart
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98]'
                  : 'bg-emerald-600/60 text-white/90 hover:bg-emerald-600/70')
              }
            >
              ▶ START MASZYNY
            </button>
            {!canStart && (
              <p className="text-sm text-amber-600 mt-3">Uzupełnij wszystkie pola nagłówka oznaczone *</p>
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
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">Maszyna pracuje bez przestojów — brak zatrzymań do zalogowania.</p>
            ) : (
              <StopsTable stops={report.stops} onEdit={setEditStopId} />
            )}
          </div>

          {/* Obserwacje i wnioski — dostępne NA BIEŻĄCO, nie tylko po sesji.
              Inżynier może zapisywać spostrzeżenia w trakcie obserwacji maszyny. */}
          <NotesSection report={report} setReport={setReport} />

          {/* Finish */}
          {report.phase === 'running' && (
            <button
              onClick={finishSession}
              className="w-full btn-secondary text-base py-4 border-2 border-sure-dark"
            >
              ⏹ STOP — ZAKOŃCZ SESJĘ
            </button>
          )}

          {/* Stop modal (nowe zatrzymanie na żywo) */}
          {stopModal && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-5 space-y-4 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
                <div>
                  <h3 className="text-lg font-bold dark:text-gray-100">Zatrzymanie maszyny</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
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
                  <MicTextarea
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
              <StopsTable stops={report.stops} onEdit={setEditStopId} />
            </div>
          )}

          <NotesSection report={report} setReport={setReport} />

          <div className="card">
            <h3 className="section-title">Dokumentacja fotograficzna (ogólna)</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
              Zdjęcia / wideo nieprzypisane do konkretnego zatrzymania.
            </p>
            <MediaUploader
              media={report.generalMedia || []}
              onChange={(m) => setReport((r) => ({ ...r, generalMedia: m }))}
            />
          </div>

          <ReportActionBar page={page} status={report.status} navigate={navigate} showFinish={false} />
        </>
      )}

      {/* Modal edycji istniejącego zatrzymania — dostępny w Fazie 2 i 3 */}
      {editStop && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-5 space-y-4 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold dark:text-gray-100">Edytuj zatrzymanie</h3>
              <button
                onClick={() => setEditStopId(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none px-1"
                aria-label="Zamknij"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Godzina rozpoczęcia</label>
                <input
                  type="time"
                  className="field-input"
                  value={timeHHMM(editStop.startAt)}
                  onChange={(e) => { if (e.target.value) patchStopStart(editStop.id, e.target.value) }}
                />
              </div>
              <div>
                <label className="field-label">Czas trwania</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    className="field-input"
                    value={Math.floor((editStop.durationMs || 0) / 60000)}
                    onChange={(e) => {
                      const min = Math.max(0, parseInt(e.target.value || '0', 10) || 0)
                      const sec = Math.floor(((editStop.durationMs || 0) % 60000) / 1000)
                      patchStopDuration(editStop.id, (min * 60 + sec) * 1000)
                    }}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">min</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    className="field-input"
                    value={Math.floor(((editStop.durationMs || 0) % 60000) / 1000)}
                    onChange={(e) => {
                      const sec = Math.min(59, Math.max(0, parseInt(e.target.value || '0', 10) || 0))
                      const min = Math.floor((editStop.durationMs || 0) / 60000)
                      patchStopDuration(editStop.id, (min * 60 + sec) * 1000)
                    }}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">s</span>
                </div>
              </div>
            </div>

            <div>
              <label className="field-label">Powód zatrzymania</label>
              <select
                className="field-input"
                value={editStop.reason}
                onChange={(e) => patchStop(editStop.id, { reason: e.target.value })}
              >
                {STOP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {editStop.reason === 'Inne' && (
              <div>
                <label className="field-label">Opisz powód</label>
                <input
                  type="text"
                  className="field-input"
                  value={editStop.customReason || ''}
                  onChange={(e) => patchStop(editStop.id, { customReason: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="field-label">Komentarz</label>
              <MicTextarea
                value={editStop.comment || ''}
                onChange={(e) => patchStop(editStop.id, { comment: e.target.value })}
                placeholder="Krótki opis sytuacji…"
              />
            </div>
            <div>
              <label className="field-label">Dokumentacja foto / wideo</label>
              <MediaUploader
                media={editStop.media || []}
                onChange={(m) => patchStop(editStop.id, { media: m })}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => deleteStop(editStop.id)}
                className="btn-secondary flex-1 text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                🗑 Usuń zatrzymanie
              </button>
              <button onClick={() => setEditStopId(null)} className="btn-success flex-1">
                Gotowe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Tabela logu zatrzymań — współdzielona przez Fazę 2 (na żywo) i Fazę 3
// (podsumowanie). Każdy wiersz ma przycisk edycji wywołujący onEdit(id).
function StopsTable({ stops, onEdit }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500 dark:text-gray-400">
          <tr>
            <th className="py-2 pr-2">Nr</th>
            <th className="py-2 pr-2">Godzina</th>
            <th className="py-2 pr-2">Czas</th>
            <th className="py-2 pr-2">Powód</th>
            <th className="py-2 pr-2">Komentarz</th>
            <th className="py-2 pr-2">Media</th>
            <th className="py-2 pr-2 text-right">Akcje</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((s, i) => {
            const photos = (s.media || []).filter((m) => m.kind === 'image').length
            const videos = (s.media || []).filter((m) => m.kind === 'video').length
            return (
              <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="py-2 pr-2"><span className="index-badge">{i + 1}</span></td>
                <td className="py-2 pr-2 tabular-nums">{timeHHMM(s.startAt)}</td>
                <td className="py-2 pr-2 tabular-nums">{formatDurationShort(s.durationMs)}</td>
                <td className="py-2 pr-2">
                  {s.reason === 'Inne' && s.customReason ? s.customReason : s.reason}
                </td>
                <td className="py-2 pr-2 text-gray-600 dark:text-gray-300">{s.comment || '—'}</td>
                <td className="py-2 pr-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  {photos === 0 && videos === 0 ? '—' : (
                    <span>
                      {photos > 0 && <span>📷 {photos}</span>}
                      {photos > 0 && videos > 0 && <span> · </span>}
                      {videos > 0 && <span>🎬 {videos}</span>}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-2 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(s.id)}
                    className="btn-sm bg-white text-sure-blue border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-blue-300 dark:border-gray-600 dark:hover:bg-gray-600 whitespace-nowrap"
                    aria-label={`Edytuj zatrzymanie ${i + 1}`}
                  >
                    ✎ Edytuj
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Obserwacje + wnioski/rekomendacje — wydzielone, by były identyczne i dostępne
// zarówno w trakcie sesji (Faza 2), jak i w podsumowaniu (Faza 3).
function NotesSection({ report, setReport }) {
  return (
    <>
      <div className="card">
        <h3 className="section-title">Obserwacje ogólne</h3>
        <MicTextarea
          value={report.observations}
          onChange={(e) => setReport((r) => ({ ...r, observations: e.target.value }))}
          placeholder="Co zauważyłeś podczas obserwacji maszyny?"
        />
      </div>

      <div className="card">
        <h3 className="section-title">Wnioski i rekomendacje</h3>
        <MicTextarea
          value={report.conclusions}
          onChange={(e) => setReport((r) => ({ ...r, conclusions: e.target.value }))}
          placeholder="Wnioski, propozycje usprawnień, dalsze kroki…"
        />
      </div>
    </>
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
