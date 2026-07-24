import { useEffect, useMemo, useState } from 'react'
import { loadAll } from '../utils/storage.js'
import { getDefaultAuthor, getLastBackupAt } from '../utils/settings.js'
import { getStorageEstimate } from '../utils/imageStore.js'
import { backupAllReports } from '../utils/syncPackage.js'
import { useToast } from '../components/common/Toast.jsx'
import EmptyState from '../components/common/EmptyState.jsx'
import { TYPE_LABELS, TYPE_SHORT, TYPE_ICONS, typeCategory, CATEGORY_ACCENT } from '../utils/reportMeta.js'

// Ekran startowy — pulpit „co teraz zrobić" (przebudowany w v0.51).
// Kolejność wynika z częstotliwości użycia: najpierw akcja (nowy raport +
// skróty do najczęstszych typów), potem powrót do niedokończonej pracy
// (3 ostatnie raporty), a metryki miesiąca — jako jeden cienki wiersz na dole
// (nic się z nimi nie robi, więc nie zajmują miejsca nad akcją).
// Pełna lista z wyszukiwarką, filtrami i archiwum mieszka w zakładce Raporty.

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

// Trzy skróty „nowy raport typu X" — te, których naprawdę używasz najczęściej;
// dopełniane domyślnymi (strefa „dla klienta"), gdy historia jest krótka.
const DEFAULT_QUICK = ['service', 'commissioning', 'satfat']
function quickTypes(reports) {
  const count = new Map()
  for (const r of reports) count.set(r.type, (count.get(r.type) || 0) + 1)
  const used = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  const out = []
  for (const t of [...used, ...DEFAULT_QUICK]) {
    if (TYPE_SHORT[t] && !out.includes(t)) out.push(t)
    if (out.length === 3) break
  }
  return out
}

export default function Start({ navigate }) {
  const toast = useToast()
  const [reports, setReports] = useState([])
  const [estimate, setEstimate] = useState(null) // { usage, quota }
  const [backupBusy, setBackupBusy] = useState(false)
  useEffect(() => { setReports(loadAll()) }, [])
  useEffect(() => { getStorageEstimate().then(setEstimate).catch(() => {}) }, [])

  const stats = useMemo(() => monthStats(reports), [reports])
  const quick = useMemo(() => quickTypes(reports), [reports])

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

  // Trzy ostatnio edytowane raporty — „tu skończyłem". W terenie żongluje się
  // kilkoma naraz, więc jedna karta (jak było do v0.50) była za mało.
  const recent = useMemo(() => {
    const t = (r) => new Date(r.updatedAt || r.createdAt || 0).getTime()
    return [...reports].sort((a, b) => t(b) - t(a)).slice(0, 3)
  }, [reports])

  const firstName = useMemo(() => (getDefaultAuthor().trim().split(/\s+/)[0] || ''), [])

  const fmtUpdated = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return `dziś ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return d.toISOString().slice(0, 10)
  }

  const statsLine = stats.count > 0
    ? [
        `${stats.count} ${stats.count === 1 ? 'raport' : stats.count < 5 ? 'raporty' : 'raportów'}`,
        stats.hours >= 1
          ? `${Math.round(stats.hours * 10) / 10} h u klientów`
          : stats.hours > 0 ? `${Math.round(stats.hours * 60)} min u klientów` : null,
        stats.topClient,
      ].filter(Boolean).join(' · ')
    : null

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-sure-dark dark:text-gray-100">
        {firstName ? `Cześć, ${firstName}! 👋` : 'Dzień dobry! 👋'}
      </h1>

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

      {/* AKCJA na pierwszym miejscu — to po to najczęściej otwiera się apkę */}
      <div className="space-y-2">
        <button
          onClick={() => navigate('new')}
          className="w-full btn-primary text-lg py-6 shadow-sm"
        >
          + Nowy raport
        </button>
        {/* Skróty do najczęstszych typów — omijają ekran wyboru typu */}
        <div className="grid grid-cols-3 gap-2">
          {quick.map((t) => (
            <button
              key={t}
              onClick={() => navigate(t)}
              title={`Nowy raport: ${TYPE_LABELS[t]}`}
              className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg border border-gray-300 bg-white text-sure-dark hover:border-sure-blue hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 transition"
            >
              <span className="text-lg leading-none" aria-hidden="true">{TYPE_ICONS[t]}</span>
              <span className="text-xs font-medium text-center leading-tight">{TYPE_SHORT[t]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* WRÓĆ DO PRACY — trzy ostatnio edytowane raporty */}
      {recent.length > 0 && (
        <section className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
            ⏱ Wróć do pracy
          </div>
          {recent.map((r) => {
            const completed = r.status === 'completed'
            return (
              <button
                key={r.id}
                onClick={() => navigate(`${r.type}/${r.id}`)}
                className={
                  'card w-full text-left flex items-center gap-3 hover:border-sure-blue hover:shadow transition ' +
                  (CATEGORY_ACCENT[typeCategory(r.type)] || '')
                }
              >
                <div className="text-2xl shrink-0" aria-hidden="true">{TYPE_ICONS[r.type] || '📄'}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sure-dark dark:text-gray-100 truncate">
                    {r.header?.reportNumber || '(brak nr)'} · {r.header?.projectName || '(brak projektu)'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {TYPE_LABELS[r.type] || r.type} · zmienione {fmtUpdated(r.updatedAt)}
                  </div>
                </div>
                <span className={
                  'text-xs px-2 py-0.5 rounded-full border shrink-0 ' +
                  (completed
                    ? 'border-emerald-400 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-300 dark:bg-emerald-900/30'
                    : 'border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-500/50 dark:text-amber-300 dark:bg-amber-900/30')
                }>
                  {completed ? '🔒' : 'Roboczy'}
                </span>
                <span className="text-sure-blue text-xl shrink-0" aria-hidden="true">›</span>
              </button>
            )
          })}
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
        <EmptyState icon="📋" title="Zacznij od pierwszego raportu" hint="Wybierz typ powyżej. Zapisane raporty znajdziesz w zakładce 🗂 Raporty na dolnym pasku.">
          <button onClick={() => navigate('help')} className="text-sure-blue underline">zobacz, jak to działa</button>
        </EmptyState>
      )}

      {/* Metryki miesiąca — informacja, nie akcja → jeden cichy wiersz na dole */}
      {statsLine && (
        <button
          onClick={() => navigate('reports')}
          className="w-full text-center text-xs text-gray-500 dark:text-gray-400 py-1 hover:text-sure-blue transition"
          title="Zobacz raporty"
        >
          Ten miesiąc: {statsLine}
        </button>
      )}
    </div>
  )
}
