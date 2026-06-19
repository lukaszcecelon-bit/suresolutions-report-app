import { useEffect, useState } from 'react'
import Home from './pages/Home.jsx'
import NewReport from './pages/NewReport.jsx'
import Help from './pages/Help.jsx'
import Settings from './pages/Settings.jsx'
import CommissioningReport from './components/reports/CommissioningReport.jsx'
import ServiceReport from './components/reports/ServiceReport.jsx'
import PrototypeReport from './components/reports/PrototypeReport.jsx'
import SatFatReport from './components/reports/SatFatReport.jsx'
import ComplaintReport from './components/reports/ComplaintReport.jsx'
import InstallPrompt from './components/common/InstallPrompt.jsx'
import UpdatePrompt from './components/common/UpdatePrompt.jsx'
import OnboardingTour from './components/common/OnboardingTour.jsx'
import { ToastProvider, useToast } from './components/common/Toast.jsx'
import { SWProvider, useSW } from './components/common/SWManager.jsx'
import { ThemeProvider, ThemeToggle } from './components/common/ThemeContext.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import logo from './assets/logo.png'

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!h) return { name: 'home' }
  const [name, id] = h.split('/')
  return { name, id }
}

// Clickable version badge in the top-right of the header. Tap → manually triggers
// a service-worker update check. Toast feedback either way:
//   - update found → the existing UpdatePrompt banner shows itself
//   - app already current → quick "Apka jest aktualna" toast
function VersionBadge() {
  const toast = useToast()
  const { checkForUpdate } = useSW()
  const [checking, setChecking] = useState(false)

  const onClick = async () => {
    if (checking) return
    setChecking(true)
    try {
      const found = await checkForUpdate()
      if (!found) toast.success('Apka jest aktualna')
      // If found, the banner from <UpdatePrompt> shows automatically — no extra toast.
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
      <span>v0.34</span>
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
  if (route.name === 'home') page = <Home navigate={navigate} />
  else if (route.name === 'new') page = <NewReport navigate={navigate} />
  else if (route.name === 'commissioning') page = <CommissioningReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'service') page = <ServiceReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'prototype') page = <PrototypeReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'satfat') page = <SatFatReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'complaint') page = <ComplaintReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'help') page = <Help navigate={navigate} />
  else if (route.name === 'settings') page = <Settings navigate={navigate} />
  else page = <Home navigate={navigate} />

  return (
    <div className="min-h-full flex flex-col">
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
            <button
              onClick={() => navigate('help')}
              className="text-gray-500 dark:text-gray-300 hover:text-sure-blue hover:bg-gray-100 dark:hover:bg-gray-700 w-8 h-8 rounded-full transition flex items-center justify-center text-sm font-bold border border-gray-300 dark:border-gray-600"
              title="Pomoc — jak działa aplikacja"
              aria-label="Pomoc"
            >
              ?
            </button>
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

      <UpdatePrompt />
      <InstallPrompt />
      <OnboardingTour />
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
