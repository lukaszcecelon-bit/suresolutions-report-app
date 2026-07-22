import { useEffect, useState } from 'react'
import Start from './pages/Start.jsx'
import Reports from './pages/Reports.jsx'
import NewReport from './pages/NewReport.jsx'
import Help from './pages/Help.jsx'
import Settings from './pages/Settings.jsx'
import CommissioningReport from './components/reports/CommissioningReport.jsx'
import ServiceReport from './components/reports/ServiceReport.jsx'
import PrototypeReport from './components/reports/PrototypeReport.jsx'
import SatFatReport from './components/reports/SatFatReport.jsx'
import ComplaintReport from './components/reports/ComplaintReport.jsx'
import LessonReport from './components/reports/LessonReport.jsx'
import InstallPrompt from './components/common/InstallPrompt.jsx'
import TabBar, { TAB_ROUTES } from './components/common/TabBar.jsx'
import UpdatePrompt from './components/common/UpdatePrompt.jsx'
import OnboardingTour from './components/common/OnboardingTour.jsx'
import StorageAlerts from './components/common/StorageAlerts.jsx'
import { sweepOrphanedMedia } from './utils/storage.js'
import { ToastProvider, useToast, useConfirm } from './components/common/Toast.jsx'
import { SWProvider, useSW } from './components/common/SWManager.jsx'
import { ThemeProvider, ThemeToggle } from './components/common/ThemeContext.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import logo from './assets/logo.png'

// Jedno źródło numeru wersji (badge + komunikaty). Zgodnie z regułą
// wersjonowania: bump TUTAJ + w package.json przy każdej zmianie kodu.
const APP_VERSION = 'v0.48'

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!h) return { name: 'home' }
  const [name, id] = h.split('/')
  return { name, id }
}

// Clickable version badge in the top-right of the header. Tap → manually triggers
// a service-worker update check:
//   - update found → the existing UpdatePrompt banner shows itself
//   - nothing found → confirm z opcją „Wymuś odświeżenie" (twarde pobranie z
//     sieci) — ratunek dla upartej, zainstalowanej PWA na iPhone, gdzie zwykły
//     check bywa ignorowany.
function VersionBadge() {
  const toast = useToast()
  const confirm = useConfirm()
  const { checkForUpdate, forceUpdate } = useSW()
  const [checking, setChecking] = useState(false)

  const onClick = async () => {
    if (checking) return
    setChecking(true)
    try {
      const found = await checkForUpdate()
      if (found) return // banner z <UpdatePrompt> pokaże się sam
      const force = await confirm(
        `Masz najnowszą wersję (${APP_VERSION}).\n\nJeśli na telefonie wciąż widzisz starą — wymuś pełne pobranie z sieci (wyczyści pamięć podręczną i przeładuje). Twoje raporty zostają nienaruszone.`,
        {
          title: 'Sprawdzanie aktualizacji',
          confirmLabel: 'Wymuś odświeżenie',
          cancelLabel: 'OK',
        }
      )
      if (force) await forceUpdate()
    } catch (e) {
      toast.error('Nie udało się sprawdzić aktualizacji')
    } finally {
      setChecking(false)
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={checking}
      className="text-xs text-gray-500 dark:text-gray-300 hover:text-sure-blue hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1.5 rounded transition flex items-center gap-1.5"
      title="Sprawdź aktualizacje"
      aria-label="Sprawdź aktualizacje"
    >
      <span>{APP_VERSION}</span>
      <span className={checking ? 'animate-spin inline-block' : 'inline-block'}>
        {checking ? '⟳' : '🔄'}
      </span>
    </button>
  )
}

function AppShell() {
  const [route, setRoute] = useState(parseHash())

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Poproś przeglądarkę o TRWAŁOŚĆ pamięci (storage.persist). Bez tego
  // localStorage/IndexedDB (raporty + zdjęcia!) mogą zostać wyczyszczone
  // przy presji na dysk — szczególnie iOS. Zainstalowana PWA zwykle dostaje
  // zgodę automatycznie; wywołanie jest idempotentne i darmowe.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
  }, [])

  // Sprzątanie osieroconych blobów w IndexedDB raz na starcie (bezczynnie).
  // Usuwanie zdjęć/rekordów wewnątrz raportu kasuje tylko referencję w JSON, nie
  // blob — bez tego martwe zdjęcia narastają. Bezpieczne: wszystkie raporty są
  // już w localStorage, więc zbiór referencji jest kompletny.
  useEffect(() => {
    const run = () => {
      sweepOrphanedMedia()
        .then((r) => {
          if (r && (r.images || r.originals || r.videos || r.medium)) {
            console.info('[GC] osierocone bloby usunięte:', r)
          }
        })
        .catch((e) => console.warn('[GC] sweep nie powiódł się', e))
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const h = requestIdleCallback(run, { timeout: 8000 })
      return () => cancelIdleCallback?.(h)
    }
    const t = setTimeout(run, 3000)
    return () => clearTimeout(t)
  }, [])

  // After first paint, idly preload the heavy PDF/ZIP libs so the first
  // "Pobierz paczkę" click doesn't pay the network cost. Doesn't block
  // initial render — only warms the browser module cache in the background.
  useEffect(() => {
    const preload = () => {
      import('./utils/pdfGenerator.js')
        .then((m) => m.warmupLibs?.())
        .catch(() => {})
    }
    if (typeof requestIdleCallback !== 'undefined') {
      const handle = requestIdleCallback(preload, { timeout: 5000 })
      return () => cancelIdleCallback?.(handle)
    } else {
      const t = setTimeout(preload, 2000)
      return () => clearTimeout(t)
    }
  }, [])

  const navigate = (path) => { window.location.hash = path }

  let page
  if (route.name === 'home') page = <Start navigate={navigate} />
  else if (route.name === 'reports') page = <Reports navigate={navigate} />
  else if (route.name === 'new') page = <NewReport navigate={navigate} />
  else if (route.name === 'commissioning') page = <CommissioningReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'service') page = <ServiceReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'prototype') page = <PrototypeReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'satfat') page = <SatFatReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'complaint') page = <ComplaintReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'lesson') page = <LessonReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'help') page = <Help navigate={navigate} />
  else if (route.name === 'settings') page = <Settings navigate={navigate} />
  else page = <Start navigate={navigate} />

  // Dolny pasek tylko na ekranach najwyższego poziomu — formularze raportów
  // go chowają (drill-down; klawiatura + pasek akcji potrzebują miejsca).
  const showTabs = TAB_ROUTES.includes(route.name)

  return (
    <div
      className="min-h-full flex flex-col"
      style={{ paddingBottom: showTabs ? 'calc(3.75rem + env(safe-area-inset-bottom))' : undefined }}
    >
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <button
            onClick={() => navigate('')}
            className="flex items-center gap-3 hover:opacity-80 transition min-w-0"
            aria-label="Strona główna"
          >
            <img src={logo} alt="SureSolutions" className="h-10 w-auto" />
            <span className="hidden sm:inline text-sm font-semibold text-sure-dark dark:text-gray-100">Raporty SURE</span>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => navigate('settings')}
              className="text-gray-500 dark:text-gray-300 hover:text-sure-blue hover:bg-gray-100 dark:hover:bg-gray-700 w-8 h-8 rounded-full transition flex items-center justify-center text-base border border-gray-300 dark:border-gray-600"
              title="Ustawienia"
              aria-label="Ustawienia"
            >
              ⚙️
            </button>
            {/* „?" (Pomoc) przeniesione z nagłówka do dolnego paska (TabBar) */}
            <ThemeToggle />
            <VersionBadge />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {page}
        </div>
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
          SureSolutions — aplikacja raportowa
        </div>
      </footer>

      <StorageAlerts />
      <UpdatePrompt />
      <InstallPrompt />
      <OnboardingTour />
      {showTabs && <TabBar routeName={route.name} navigate={navigate} />}
    </div>
  )
}

export default function App() {
  // Provider order:
  //   ErrorBoundary (łapie wyjątki całego drzewa, w tym providerów)
  //   → ThemeProvider (no deps)
  //   → SWProvider (no deps on theme/toast)
  //   → ToastProvider (consumers exist)
  //   → AppShell
  // VersionBadge uses both useSW and useToast; ThemeToggle uses useTheme.
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SWProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </SWProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
