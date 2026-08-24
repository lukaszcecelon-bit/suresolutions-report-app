import { useEffect, useMemo, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import ReportTopBar from '../common/ReportTopBar.jsx'
import ReportActionBar from '../common/ReportActionBar.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import NotesList from '../common/NotesList.jsx'
import { getById, newId } from '../../utils/storage.js'
import { computeReportNumber } from '../../utils/reportNumber.js'
import { getDefaultAuthor, getStopReasons } from '../../utils/settings.js'
import { useReportPage } from '../../utils/useReportPage.js'
import { useWakeLock } from '../../utils/useWakeLock.js'
import { buildCommissioningPackage, buildCommissioningPdf } from '../../utils/pdfGenerator.js'
import { deleteImage, deleteVideo, deleteOriginal } from '../../utils/imageStore.js'

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

// Znacznik dla KONKRETNEJ daty (YYYY-MM-DD) i godziny (HH:MM). Inaczej niż
// setTimeOnISO nie dziedziczy dnia po poprzedniej wartości — dzień bierze się
// zawsze z pola daty, więc godzin nie da się „przesunąć" na inną dobę.
function isoOnDate(dateISO, hhmm) {
  const [hh, mm] = (hhmm || '00:00').split(':').map((n) => parseInt(n, 10) || 0)
  const d = new Date(`${dateISO || todayISO()}T00:00:00`)
  d.setHours(hh, mm, 0, 0)
  return d.toISOString()
}

// Dzień znacznika w czasie LOKALNYM (nie UTC) — do porównania z polem daty.
function localDateOf(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
      projectNumber: '',   // numer projektu (wpisywany) — jak w raporcie serwisowym
      reportNumber: '',     // auto: URU-{projectNumber}-{date}
      projectName: '',
      machineName: '',
      date: todayISO(),
      author: getDefaultAuthor(),   // domyślny autor z Ustawień
    },
    phase: 'setup', // setup | running | stopped | finished
    manual: false,  // true = raport wypełniany ręcznie (tryb awaryjny, v1.0)
    sessionStartAt: null,
    sessionEndAt: null,
    // Szkic trwającego zatrzymania — TRZYMANY W RAPORCIE, nie w stanie
    // komponentu. Przedtem powód/komentarz/media siedziały w useState modala,
    // więc powrót do raportu (przeładowanie PWA, wejście z listy) gubił modal i
    // maszyny NIE DAŁO SIĘ wznowić — jedyny przycisk „Zapisz i wznów" był w tym
    // modalu. { startAt, reason, customReason, comment, media }
    activeStop: null,
    stops: [], // { id, startAt, endAt, durationMs, reason, customReason, comment, media: [] }
    observations: [], // lista rekordów {id, text, media} (jak obserwacje w serwisie)
    conclusions: [],  // lista rekordów {id, text, media} — wnioski/rekomendacje
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

  // Ekran nie gaśnie podczas trwającej sesji (running/stopped) — inżynier
  // obserwuje maszynę i live-timer, nie dotykając telefonu.
  useWakeLock(report.phase === 'running' || report.phase === 'stopped')

  // Samo-naprawa raportów ręcznych zapisanych przez v1.0: tamta wersja mogła
  // dosunąć koniec sesji o dobę (patrz komentarz przy setSessionTime), co dawało
  // czasy pracy w rodzaju 31:25:00. Raport ręczny trwa jeden dzień, więc
  // sprowadzamy znaczniki na datę z nagłówka — bez ruszania sesji mierzonych na
  // żywo, gdzie przełom doby jest prawdziwy.
  useEffect(() => {
    if (!report.manual) return
    const date = report.header?.date
    if (!date) return
    const drifted = [report.sessionStartAt, report.sessionEndAt]
      .some((iso) => iso && localDateOf(iso) !== date)
    if (!drifted) return
    setReport((r) => ({
      ...r,
      sessionStartAt: r.sessionStartAt ? isoOnDate(date, timeHHMM(r.sessionStartAt)) : r.sessionStartAt,
      sessionEndAt: r.sessionEndAt ? isoOnDate(date, timeHHMM(r.sessionEndAt)) : r.sessionEndAt,
    }))
  }, [report.manual, report.header?.date, report.sessionStartAt, report.sessionEndAt])

  const [attemptedStart, setAttemptedStart] = useState(false)

  // Wspólny szkielet strony raportu (auto-save, paczki). Uruchomienie NIE
  // używa locka ukończonych — obserwacje/wnioski i edycja zatrzymań muszą
  // pozostać dostępne także po zakończeniu sesji, a blokada odcięłaby te pola.
  const page = useReportPage({ report, setReport, buildPackage: buildCommissioningPackage, buildPdf: buildCommissioningPdf })
  const { toast, confirm } = page

  // Powody zatrzymań z Ustawień (edytowalne) + zawsze „Inne" na końcu (custom).
  const STOP_REASONS = useMemo(() => [...getStopReasons(), 'Inne'], [])

  // Numer raportu liczony automatycznie z numeru projektu + daty (jak w serwisie).
  // Gdy numer projektu pusty, zachowujemy ewentualny ręczny numer starszych
  // raportów (sprzed tej zmiany), by ich nie skasować.
  const updateHeader = (h) => setReport((r) => ({
    ...r,
    header: { ...h, reportNumber: computeReportNumber('URU', h.projectNumber, h.date, h.reportNumber) },
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
  // Modal jest POCHODNĄ danych raportu (`phase === 'stopped' && activeStop`),
  // a nie osobnym stanem — dzięki temu odtwarza się po każdym powrocie do
  // raportu i nie da się utknąć na czerwonym ekranie bez przycisku wznowienia.
  const activeStop = report.activeStop
  const patchActiveStop = (patch) =>
    setReport((r) => ({ ...r, activeStop: { ...r.activeStop, ...patch } }))

  const openStop = () => {
    setReport((r) => ({
      ...r,
      phase: 'stopped',
      activeStop: { startAt: nowISO(), reason: STOP_REASONS[0], customReason: '', comment: '', media: [] },
    }))
  }

  const cancelStop = () => {
    // user changed mind — discard active stop
    setReport((r) => ({ ...r, phase: 'running', activeStop: null }))
  }

  const saveStopAndResume = () => {
    const as = report.activeStop || {}
    const startAt = as.startAt || nowISO()
    const endAt = nowISO()
    const durationMs = Math.max(0, new Date(endAt) - new Date(startAt))
    // `reason` z fallbackiem — zatrzymania rozpoczęte przed v1.0 miały w
    // `activeStop` samą godzinę, bez pól szkicu.
    const reason = as.reason || STOP_REASONS[0]
    const stop = {
      id: newId(),
      startAt,
      endAt,
      durationMs,
      reason,
      customReason: reason === 'Inne' ? (as.customReason || '') : '',
      comment: as.comment || '',
      media: as.media || [],
    }
    setReport((r) => ({
      ...r,
      phase: 'running',
      activeStop: null,
      stops: [...r.stops, stop],
    }))
  }

  // ==== TRYB RĘCZNY (awaryjny) ====
  // Wejście świadomie dyskretne: domyślną ścieżką ma zostać pomiar na żywo.
  // Sesja ląduje od razu w podsumowaniu, gdzie godziny i zatrzymania wpisuje
  // się z ręki (np. gdy telefon padł albo obserwację prowadzono na kartce).
  const startManual = async () => {
    if (!(await confirm(
      'Godziny pracy maszyny i wszystkie zatrzymania wpiszesz ręcznie — bez pomiaru na żywo. ' +
      'Raport zostanie oznaczony jako wypełniony ręcznie. Używaj tego tylko awaryjnie.',
      { title: 'Tryb ręczny', confirmLabel: 'Wypełniam ręcznie' }
    ))) return
    setReport((r) => ({ ...r, manual: true, phase: 'finished' }))
  }

  // Godziny sesji wpisywane z ręki. Trzymamy pełne znaczniki ISO (jak przy
  // pomiarze), więc PDF, statystyki i eksport liczą się tą samą ścieżką.
  //
  // ZASADA: cała sesja mieszka w JEDNYM dniu — tym z pola daty. Dzień nigdy nie
  // dziedziczy się po poprzedniej wartości pola. Wcześniejsza wersja dosuwała
  // koniec o dobę, gdy wypadł przed startem („sesja przez północ"), a pole
  // czasu przechodzi w trakcie pisania przez stany pośrednie: wpisując „14:50"
  // mijasz „01:50", które jest przed startem. Efekt: koniec lądował na kolejnym
  // dniu i czas pracy wychodził 31:25:00 zamiast 07:25:00 — bez widocznej daty
  // nie było tego jak zauważyć ani poprawić.
  const setSessionTime = (which, hhmm) => {
    if (!hhmm) return
    setReport((r) => {
      const next = isoOnDate(r.header?.date, hhmm)
      return which === 'start' ? { ...r, sessionStartAt: next } : { ...r, sessionEndAt: next }
    })
  }

  // Zmiana daty przenosi CAŁĄ sesję: godziny sesji i wszystkie zatrzymania
  // (zakładamy jeden dzień, więc rozjazd dat nie ma prawa powstać). Data to
  // to samo pole co w nagłówku, dlatego numer raportu przelicza się jak przy
  // edycji nagłówka.
  const setSessionDate = (dateISO) => {
    if (!dateISO) return
    setReport((r) => {
      const move = (iso) => (iso ? isoOnDate(dateISO, timeHHMM(iso)) : iso)
      return {
        ...r,
        header: {
          ...r.header,
          date: dateISO,
          reportNumber: computeReportNumber('URU', r.header?.projectNumber, dateISO, r.header?.reportNumber),
        },
        sessionStartAt: move(r.sessionStartAt),
        sessionEndAt: move(r.sessionEndAt),
        stops: (r.stops || []).map((s) => {
          const startAt = move(s.startAt)
          return { ...s, startAt, endAt: new Date(new Date(startAt).getTime() + (s.durationMs || 0)).toISOString() }
        }),
      }
    })
  }

  // Ręczne dodanie zatrzymania — gdy inżynier zapomniał kliknąć „ZATRZYMANIE"
  // na żywo. Tworzy rekord z domyślnym czasem i od razu otwiera modal edycji,
  // gdzie koryguje godzinę, czas trwania i powód (reużycie całej maszynerii
  // edycji — zero nowego kodu formularza).
  const addManualStop = () => {
    // Punkt odniesienia = początek sesji, nie „teraz". Przy raporcie
    // uzupełnianym po fakcie (tryb ręczny) „teraz" wsadziłoby zatrzymanie w
    // dzisiejszą datę, a korekta w modalu zmienia tylko godzinę, nie dzień.
    const startAt = report.sessionStartAt || nowISO()
    const stop = {
      id: newId(), startAt, endAt: startAt, durationMs: 0,
      reason: STOP_REASONS[0], customReason: '', comment: '', media: [],
    }
    setReport((r) => ({ ...r, stops: [...(r.stops || []), stop] }))
    setEditStopId(stop.id)
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
      <ReportTopBar page={page} report={report} navigate={navigate}>
        <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {report.phase === 'setup' && 'Faza 1: Start sesji'}
          {report.phase === 'running' && 'Faza 2: Logowanie na żywo'}
          {report.phase === 'stopped' && 'Faza 2: Zatrzymanie maszyny'}
          {report.phase === 'finished' && 'Faza 3: Podsumowanie'}
        </div>
      </ReportTopBar>

      {/* FAZA 1 */}
      {report.phase === 'setup' && (
        <>
          <Header
            header={report.header}
            onChange={updateHeader}
            reportType="commissioning"
            showErrors={attemptedStart}
            showClient
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

          {/* Wejście awaryjne — celowo małe i na końcu, żeby domyślną ścieżką
              został pomiar na żywo. Potrzebne, gdy telefon padł w trakcie sesji
              albo obserwację prowadzono na kartce. */}
          <button
            type="button"
            onClick={startManual}
            className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition"
          >
            <span className="text-sm font-medium">⌨ Wypełnij ręcznie (tryb awaryjny)</span>
            <span className="block text-xs mt-0.5">
              Bez pomiaru na żywo — godziny pracy i zatrzymania wpisujesz z ręki.
            </span>
          </button>
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
            {/* Ręczne dodanie zatrzymania (dostępne poza aktywnym zatrzymaniem) */}
            {report.phase === 'running' && (
              <button
                onClick={addManualStop}
                className="btn-sm w-full mt-3 bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                + Dodaj zatrzymanie ręcznie
              </button>
            )}
          </div>

          {/* Obserwacje i wnioski — dostępne NA BIEŻĄCO, nie tylko po sesji.
              Inżynier może zapisywać spostrzeżenia w trakcie obserwacji maszyny. */}
          <NotesSection report={report} setReport={setReport} confirm={confirm} />

          {/* Finish */}
          {report.phase === 'running' && (
            <button
              onClick={finishSession}
              className="w-full btn-secondary text-base py-4 border-2 border-sure-dark"
            >
              ⏹ STOP — ZAKOŃCZ SESJĘ
            </button>
          )}

          {/* Stop modal (nowe zatrzymanie na żywo) — sterowany danymi raportu,
              więc wraca po każdym ponownym otwarciu raportu. */}
          {report.phase === 'stopped' && activeStop && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-5 space-y-4 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
                <div>
                  <h3 className="text-lg font-bold dark:text-gray-100">Zatrzymanie maszyny</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Godzina: <span className="font-mono">{timeHHMM(activeStop.startAt)}</span>
                    {' · Trwa: '}
                    <span className="font-mono">{formatDurationShort(activeStopMs)}</span>
                  </p>
                </div>
                <div>
                  <label className="field-label">Powód zatrzymania</label>
                  <select
                    className="field-input"
                    value={activeStop.reason || STOP_REASONS[0]}
                    onChange={(e) => patchActiveStop({ reason: e.target.value })}
                  >
                    {STOP_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {activeStop.reason === 'Inne' && (
                  <div>
                    <label className="field-label">Opisz powód</label>
                    <input
                      type="text"
                      className="field-input"
                      value={activeStop.customReason || ''}
                      onChange={(e) => patchActiveStop({ customReason: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label className="field-label">Komentarz</label>
                  <MicTextarea
                    value={activeStop.comment || ''}
                    onChange={(e) => patchActiveStop({ comment: e.target.value })}
                    placeholder="Krótki opis sytuacji…"
                  />
                </div>
                <div>
                  <label className="field-label">Dokumentacja foto / wideo</label>
                  <MediaUploader
                    media={activeStop.media || []}
                    onChange={(m) => patchActiveStop({ media: m })}
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
            <h3 className="text-lg font-semibold mb-4">
              Podsumowanie sesji
              {report.manual && (
                <span className="ml-2 align-middle text-xs font-normal bg-white/15 rounded-full px-2 py-0.5">
                  wypełniony ręcznie
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Całkowity czas pracy" value={formatDuration(stats.totalRunMs)} mono />
              <Stat label="Liczba zatrzymań" value={String(stats.stopCount)} />
              <Stat label="Łączny czas przestojów" value={formatDurationShort(stats.totalStopMs)} />
              <Stat label="Najdłuższe zatrzymanie" value={formatDurationShort(stats.longestStop)} />
            </div>
          </div>

          {/* Godziny sesji do wpisania/korekty. Dostępne także dla sesji
              mierzonych na żywo — po awarii telefonu koniec sesji bywa zapisany
              w złym momencie i musi dać się poprawić. */}
          <div className="card">
            <h3 className="section-title">Czas pracy maszyny</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Data JAWNIE w formularzu — bez niej rozjazd dnia był
                  niewidoczny i nie do poprawienia. To ta sama data co w
                  nagłówku raportu. */}
              <div className="min-w-0">
                <label className="field-label" htmlFor="sess-date">Data</label>
                <input id="sess-date" type="date" className="field-input"
                  value={report.header?.date || ''}
                  onChange={(e) => setSessionDate(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className="field-label" htmlFor="sess-start">Rozpoczęcie</label>
                <input id="sess-start" type="time" className="field-input"
                  value={report.sessionStartAt ? timeHHMM(report.sessionStartAt) : ''}
                  onChange={(e) => setSessionTime('start', e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className="field-label" htmlFor="sess-end">Zakończenie</label>
                <input id="sess-end" type="time" className="field-input"
                  value={report.sessionEndAt ? timeHHMM(report.sessionEndAt) : ''}
                  onChange={(e) => setSessionTime('end', e.target.value)} />
              </div>
            </div>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              {!report.sessionStartAt || !report.sessionEndAt ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Podaj obie godziny — bez nich raport nie ma czasu pracy maszyny.
                </span>
              ) : stats.totalRunMs <= 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Zakończenie jest wcześniejsze niż rozpoczęcie — popraw godziny.
                </span>
              ) : (
                <>Czas pracy: <strong className="text-sure-dark dark:text-gray-100">{formatDuration(stats.totalRunMs)}</strong></>
              )}
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                Cała sesja (godziny i zatrzymania) mieści się w tym jednym dniu.
                Zmiana daty przenosi wszystkie wpisy.
              </span>
            </p>
          </div>

          <Header header={report.header} onChange={updateHeader} reportType="commissioning" showClient />

          {/* Log zatrzymań pokazywany zawsze — w podsumowaniu trzeba móc dopisać
              zatrzymanie, którego nie zalogowano na żywo (albo całą listę, gdy
              raport powstaje w trybie ręcznym). */}
          <div className="card">
            <h3 className="section-title">Log zatrzymań ({report.stops.length})</h3>
            {report.stops.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                Brak zatrzymań — maszyna pracowała bez przestojów.
              </p>
            ) : (
              <StopsTable stops={report.stops} onEdit={setEditStopId} />
            )}
            <button
              onClick={addManualStop}
              className="btn-sm w-full mt-3 bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              + Dodaj zatrzymanie ręcznie
            </button>
          </div>

          <NotesSection report={report} setReport={setReport} confirm={confirm} />

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

          {/* Raport ręczny nie ma „zakończenia sesji", które w trybie live
              ustawia status — dlatego tylko tu pokazujemy „Oznacz ukończony". */}
          <ReportActionBar page={page} status={report.status} navigate={navigate} showFinish={!!report.manual} />
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
// zarówno w trakcie sesji (Faza 2), jak i w podsumowaniu (Faza 3). Każda sekcja
// to lista powtarzalnych rekordów (jak obserwacje w raporcie serwisowym).
function NotesSection({ report, setReport, confirm }) {
  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">Obserwacje</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{(report.observations || []).length}</span>
        </div>
        <NotesList
          items={report.observations}
          onChange={(v) => setReport((r) => ({ ...r, observations: v }))}
          confirm={confirm}
          addLabel="+ Dodaj obserwację"
          placeholder="Co zauważyłeś podczas obserwacji maszyny?"
          emptyIcon="👁️"
          emptyTitle="Brak obserwacji"
          emptyHint={'Kliknij „+ Dodaj obserwację" poniżej. Każda obserwacja to osobny wpis — możesz dodać zdjęcie i zmieniać kolejność (≡).'}
          removeConfirm="Usunąć tę obserwację?"
          newItemLabel="Nowa obserwacja"
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">Wnioski i rekomendacje</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{(report.conclusions || []).length}</span>
        </div>
        <NotesList
          items={report.conclusions}
          onChange={(v) => setReport((r) => ({ ...r, conclusions: v }))}
          confirm={confirm}
          addLabel="+ Dodaj wniosek / rekomendację"
          placeholder="Wnioski, propozycje usprawnień, dalsze kroki…"
          emptyIcon="💡"
          emptyTitle="Brak wniosków"
          emptyHint={'Kliknij „+ Dodaj wniosek / rekomendację" poniżej. Każdy wpis jest osobny.'}
          removeConfirm="Usunąć ten wpis?"
          newItemLabel="Nowy wniosek"
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
