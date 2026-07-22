import { useEffect, useMemo, useState } from 'react'
import { loadAll } from '../utils/storage.js'
import { getDefaultAuthor, getLastBackupAt } from '../utils/settings.js'
import { getStorageEstimate } from '../utils/imageStore.js'
import { backupAllReports } from '../utils/syncPackage.js'
import { useToast } from '../components/common/Toast.jsx'
import { TYPE_LABELS, TYPE_ICONS, typeCategory, CATEGORY_ACCENT } from '../utils/reportMeta.js'

// Ekran startowy (v0.42) — lekki „pulpit" zamiast pełnej listy raportów:
// powitanie, statystyki miesiąca, wielki „+ Nowy raport" i karta
// „kontynuuj ostatni" (najczęstsza realna potrzeba w terenie).
// Pełna lista z wyszukiwarką, filtrami, multi-selectem, importem/backupem
// i rejestrem lekcji mieszka w zakładce 🗂 Raporty (dolny pasek).

// Czas wizyty serwisowej w minutach (HH:MM, z przejściem przez północ).
function visitMinutes(arrival, departure) {
  if (!arrival || !departure) return 0
  const [ah, am] = String(arrival).split(':').map(Number)
  const [dh, dm] = String(departure).split(':').map(Number)
  if ([ah, am, dh, dm].some((n) => Number.isNaN(n))) return 0
  let mins = (dh * 60 + dm) - (ah * 60 + am)
  if (mins < 0) mins += 24 * 60
  return mins
}

// Statystyki bieżącego miesiąca: liczba raportów, czas u klientów
// (wizyty serwisowe + sesje uruchomień), najczęstszy klient.
function monthStats(reports) {
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const inMonth = reports.filter((r) =>
    (r.header?.date || (r.createdAt || '').slice(0, 10)).startsWith(ym)
  )
  let minutes = 0
  const clientCount = new Map()
  for (const r of inMonth) {
    if (r.type === 'service') {
      minutes += visitMinutes(r.visit?.arrival, r.visit?.departure)
    } else if (r.type === 'commissioning' && r.sessionStartAt && r.sessionEndAt) {
      minutes += Math.max(0, (new Date(r.sessionEndAt) - new Date(r.sessionStartAt)) / 60000)
    }
    const client = (r.visit?.client || r.info?.client || '').trim()
    if (client) clientCount.set(client, (clientCount.get(client) || 0) + 1)
  }
  let topClient = null
  let top = 0
  for (const [c, n] of clientCount) {
    if (n > top) { top = n; topClient = c }
  }
  const hours = minutes / 60
  return { count: inMonth.length, hours, topClient }
}

export default function Start({ navigate }) {
  const toast = useToast()
  const [reports, setReports] = useState([])
  const [estimate, setEstimate] = useState(null) // { usage, quota }
  const [backupBusy, setBackupBusy] = useState(false)
  useEffect(() => { setReports(loadAll()) }, [])
  useEffect(() => { getStorageEstimate().then(setEstimate).catch(() => {}) }, [])

  const stats = useMemo(() => monthStats(reports), [reports])

  // Bezpieczeństwo danych (v0.47): pamięć prawie pełna LUB dawno bez backupu.
  // Jedyna kopia to urządzenie, więc łagodnie przypominamy o backupie.
  const storagePct = estimate && estimate.quota ? estimate.usage / estimate.quota : 0
  const daysSinceBackup = useMemo(() => {
    const iso = getLastBackupAt()
    if (!iso) return Infinity
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  }, [])
  const storageWarn = storagePct >= 0.85
  const backupWarn = reports.length >= 3 && daysSinceBackup >= 14

  const doBackup = async () => {
    if (backupBusy) return
    setBackupBusy(true)
    try {
      const n = await backupAllReports()
      toast.success(`Backup gotowy — ${n} ${n === 1 ? 'raport' : n < 5 ? 'raporty' : 'raportów'}`)
    } catch (e) {
      toast.error('Błąd backupu: ' + (e.message || e))
    } finally {
      setBackupBusy(false)
    }
  }

  // Ostatnio EDYTOWANY raport (max updatedAt) — „tu skończyłem".
  const recent = useMemo(() => {
    let best = null
    let bestT = -Infinity
    for (const r of reports) {
      const t = new Date(r.updatedAt || r.createdAt || 0).getTime()
      if (t > bestT) { bestT = t; best = r }
    }
    return best
  }, [reports])

  // Imię z domyślnego autora (Ustawienia) — drobne, osobiste powitanie.
  const firstName = useMemo(() => (getDefaultAuthor().trim().split(/\s+/)[0] || ''), [])

  const fmtUpdated = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return `dziś ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return d.toISOString().slice(0, 10)
  }

  const recentCompleted = recent?.status === 'completed'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-sure-dark dark:text-gray-100">
          {firstName ? `Cześć, ${firstName}! 👋` : 'Dzień dobry! 👋'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Co dziś dokumentujemy?</p>
      </div>

      {/* Bezpieczeństwo danych: pamięć prawie pełna / dawno bez backupu */}
      {(storageWarn || backupWarn) && (
        <div className={
          'card flex items-start gap-3 ' +
          (storageWarn
            ? 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-900/20'
            : 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-900/20')
        }>
          <span className="text-xl shrink-0" aria-hidden="true">{storageWarn ? '⚠️' : '💾'}</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sure-dark dark:text-gray-100">
              {storageWarn ? `Pamięć prawie pełna (${Math.round(storagePct * 100)}%)` : 'Dawno nie było backupu'}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
              {storageWarn
                ? 'Zrób backup i usuń stare raporty, żeby nie stracić nowych.'
                : daysSinceBackup === Infinity
                  ? 'Twoje raporty są tylko na tym urządzeniu — zrób pierwszą kopię.'
                  : `Ostatnia kopia ${daysSinceBackup} dni temu. Raporty są tylko na tym urządzeniu.`}
            </div>
            <button
              onClick={doBackup}
              disabled={backupBusy}
              className="btn-sm btn-primary mt-2 disabled:opacity-60"
            >
              {backupBusy ? '⏳ Pakowanie…' : '💾 Zrób backup teraz'}
            </button>
          </div>
        </div>
      )}

      {/* Statystyki bieżącego miesiąca */}
      {reports.length > 0 && stats.count > 0 && (
        <section className="grid grid-cols-3 gap-2">
          <div className="card !p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Ten miesiąc</div>
            <div className="text-xl font-bold text-sure-dark dark:text-gray-100 mt-0.5 tabular-nums">{stats.count}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{stats.count === 1 ? 'raport' : stats.count < 5 ? 'raporty' : 'raportów'}</div>
          </div>
          <div className="card !p-3 text-center">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">U klientów</div>
            <div className="text-xl font-bold text-sure-dark dark:text-gray-100 mt-0.5 tabular-nums">
              {stats.hours >= 1 ? `${Math.round(stats.hours * 10) / 10} h` : stats.hours > 0 ? `${Math.round(stats.hours * 60)} min` : '—'}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">czas wizyt/sesji</div>
          </div>
          <div className="card !p-3 text-center min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Top klient</div>
            <div className="text-sm font-bold text-sure-dark dark:text-gray-100 mt-1.5 truncate" title={stats.topClient || ''}>
              {stats.topClient || '—'}
            </div>
          </div>
        </section>
      )}

      <button
        onClick={() => navigate('new')}
        className="w-full btn-primary text-lg py-6 shadow-sm"
      >
        + Nowy raport
      </button>

      {/* Kontynuuj ostatni — jedna karta, nie lista */}
      {recent && (
        <section className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
            ⏱ Ostatnio edytowany
          </div>
          <button
            onClick={() => navigate(`${recent.type}/${recent.id}`)}
            className={
              'card w-full text-left flex items-center gap-3 hover:border-sure-blue hover:shadow transition ' +
              (CATEGORY_ACCENT[typeCategory(recent.type)] || '')
            }
          >
            <div className="text-2xl shrink-0">{TYPE_ICONS[recent.type] || '📄'}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sure-dark dark:text-gray-100 truncate">
                {recent.header?.reportNumber || '(brak nr)'} · {recent.header?.projectName || '(brak projektu)'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {TYPE_LABELS[recent.type] || recent.type} · zmienione {fmtUpdated(recent.updatedAt)}
              </div>
            </div>
            <span className={
              'text-xs px-2 py-0.5 rounded-full border shrink-0 ' +
              (recentCompleted
                ? 'border-emerald-400 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-300 dark:bg-emerald-900/30'
                : 'border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-500/50 dark:text-amber-300 dark:bg-amber-900/30')
            }>
              {recentCompleted ? '🔒' : 'Roboczy'}
            </span>
            <span className="text-sure-blue text-xl shrink-0" aria-hidden="true">›</span>
          </button>
        </section>
      )}

      {reports.length > 0 ? (
        <button
          onClick={() => navigate('reports')}
          className="w-full text-center text-sm text-sure-blue py-2 hover:underline"
        >
          🗂 Wszystkie raporty ({reports.length}) →
        </button>
      ) : (
        <div className="card text-center text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
          Zacznij od pierwszego raportu — kliknij <span className="font-medium">„+ Nowy raport"</span>.
          Zapisane raporty znajdziesz potem w zakładce <span className="font-medium">🗂 Raporty</span> na dolnym pasku,
          a jak coś działa — w <button onClick={() => navigate('help')} className="text-sure-blue underline">Pomocy</button>.
        </div>
      )}
    </div>
  )
}
