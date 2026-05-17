import { useEffect, useState } from 'react'
import Home from './pages/Home.jsx'
import NewReport from './pages/NewReport.jsx'
import CommissioningReport from './components/reports/CommissioningReport.jsx'
import ServiceReport from './components/reports/ServiceReport.jsx'
import PrototypeReport from './components/reports/PrototypeReport.jsx'
import InstallPrompt from './components/common/InstallPrompt.jsx'
import UpdatePrompt from './components/common/UpdatePrompt.jsx'
import { ToastProvider } from './components/common/Toast.jsx'
import logo from './assets/logo.png'

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!h) return { name: 'home' }
  const [name, id] = h.split('/')
  return { name, id }
}

export default function App() {
  const [route, setRoute] = useState(parseHash())

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = (path) => { window.location.hash = path }

  let page
  if (route.name === 'home') page = <Home navigate={navigate} />
  else if (route.name === 'new') page = <NewReport navigate={navigate} />
  else if (route.name === 'commissioning') page = <CommissioningReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'service') page = <ServiceReport navigate={navigate} reportId={route.id} />
  else if (route.name === 'prototype') page = <PrototypeReport navigate={navigate} reportId={route.id} />
  else page = <Home navigate={navigate} />

  return (
    <ToastProvider>
      <div className="min-h-full flex flex-col">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => navigate('')}
              className="flex items-center gap-3 hover:opacity-80 transition"
              aria-label="Strona główna"
            >
              <img src={logo} alt="SureSolutions" className="h-10 w-auto" />
              <span className="hidden sm:inline text-sm font-semibold text-sure-dark">Raporty</span>
            </button>
            <div className="text-xs text-gray-500">v0.2</div>
          </div>
        </header>

        <main className="flex-1">
          <div className="max-w-5xl mx-auto px-4 py-6">
            {page}
          </div>
        </main>

        <footer className="border-t border-gray-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 text-xs text-gray-500 text-center">
            SureSolutions — aplikacja raportowa
          </div>
        </footer>

        <UpdatePrompt />
        <InstallPrompt />
      </div>
    </ToastProvider>
  )
}
