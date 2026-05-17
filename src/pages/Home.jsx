import { useEffect, useState } from 'react'
import { loadAll, remove } from '../utils/storage.js'
import { generateCommissioningPackage, generateServicePackage, generatePrototypePackage } from '../utils/pdfGenerator.js'
import { useToast, useConfirm } from '../components/common/Toast.jsx'

const TYPE_LABELS = {
  commissioning: 'Uruchomienie / obserwacja maszyny',
  service: 'Serwis na obiekcie',
  prototype: 'Testy prototypu / podzespołu',
}

const TYPE_ICONS = {
  commissioning: '▶',
  service: '🔧',
  prototype: '🧪',
}

const ONBOARDING_KEY = 'suresolutions.onboarding.v1.dismissed'

export default function Home({ navigate }) {
  const [reports, setReports] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()

  useEffect(() => {
    const all = loadAll()
    setReports(all)
    if (all.length === 0 && localStorage.getItem(ONBOARDING_KEY) !== '1') {
      setShowOnboarding(true)
    }
  }, [])

  const refresh = () => setReports(loadAll())

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setShowOnboarding(false)
  }

  const handleDelete = async (r) => {
    const ok = await confirm(`Usunąć raport „${r.header?.reportNumber || 'bez numeru'}"? Tej operacji nie można cofnąć.`, {
      title: 'Usunięcie raportu', variant: 'danger', confirmLabel: 'Usuń'
    })
    if (!ok) return
    remove(r.id)
    refresh()
    toast.success('Raport usunięty')
  }

  const handlePdf = async (r) => {
    setBusyId(r.id)
    try {
      if (r.type === 'commissioning') await generateCommissioningPackage(r)
      else if (r.type === 'service') await generateServicePackage(r)
      else if (r.type === 'prototype') await generatePrototypePackage(r)
      else toast.info('Pobieranie dla tego typu raportu zostanie dodane w kolejnej fazie.')
      toast.success('Paczka pobrana')
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setBusyId(null)
    }
  }

  const handleOpen = (r) => {
    if (r.type === 'commissioning') navigate(`commissioning/${r.id}`)
    else if (r.type === 'service') navigate(`service/${r.id}`)
    else if (r.type === 'prototype') navigate(`prototype/${r.id}`)
    else toast.error('Ten typ raportu zostanie dodany w kolejnej fazie.')
  }

  // Sort by updatedAt desc — most recent first.
  const sorted = [...reports].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  })
  const mostRecentId = sorted[0]?.id

  const fmtUpdated = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return `dziś ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    return d.toISOString().slice(0, 10)
  }

  return (
    <div className="space-y-6">
      {showOnboarding && (
        <div className="card bg-sure-blue/5 border-sure-blue/30">
          <div className="flex items-start gap-3">
            <div className="text-3xl">👋</div>
            <div className="flex-1">
              <h2 className="font-semibold text-sure-dark">Witaj w SureSolutions Raporty</h2>
              <p className="text-sm text-gray-600 mt-1">
                Zacznij od kliknięcia <strong>„+ Nowy raport"</strong> i wybierz typ.
                Twoje raporty zapisują się automatycznie w tej przeglądarce — żadnego logowania.
                Po skończeniu pobierzesz paczkę ZIP (PDF + multimedia).
              </p>
              <button
                onClick={dismissOnboarding}
                className="mt-3 text-sm text-sure-blue font-medium hover:underline"
              >
                Rozumiem
              </button>
            </div>
          </div>
        </div>
      )}

      <section>
        <button
          onClick={() => navigate('new')}
          className="w-full btn-primary text-lg py-6 shadow-sm"
        >
          + Nowy raport
        </button>
      </section>

      <section>
        <h2 className="section-title no-rule">Zapisane raporty</h2>
        {sorted.length === 0 ? (
          <div className="card text-center text-gray-500">
            Brak zapisanych raportów. Kliknij <span className="font-medium">„+ Nowy raport"</span> aby zacząć.
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((r) => {
              const isRecent = r.id === mostRecentId
              const completed = r.status === 'completed'
              const isBusy = busyId === r.id
              return (
                <div
                  key={r.id}
                  className={
                    'card flex flex-col sm:flex-row sm:items-center gap-3 transition ' +
                    (isRecent ? 'ring-2 ring-sure-blue/30' : '')
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
                      <span className="text-lg leading-none">{TYPE_ICONS[r.type] || '📄'}</span>
                      <span className="truncate">{TYPE_LABELS[r.type] || r.type}</span>
                      {isRecent && (
                        <span className="text-[10px] uppercase tracking-wider bg-sure-blue/10 text-sure-blue px-1.5 py-0.5 rounded">
                          Ostatnio
                        </span>
                      )}
                      <span className={
                        'ml-auto text-xs px-2 py-0.5 rounded-full border ' +
                        (completed
                          ? 'border-emerald-400 text-emerald-700 bg-emerald-50'
                          : 'border-amber-400 text-amber-700 bg-amber-50')
                      }>
                        {completed ? 'Ukończony' : 'Roboczy'}
                      </span>
                    </div>
                    <div className="mt-1.5 font-semibold text-sure-dark truncate">
                      {r.header?.reportNumber || '(brak nr)'} · {r.header?.projectName || '(brak projektu)'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Maszyna: {r.header?.machineName || '—'} · Data: {r.header?.date || '—'} · Autor: {r.header?.author || '—'}
                    </div>
                    {r.updatedAt && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        Zmienione {fmtUpdated(r.updatedAt)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50"
                      onClick={() => handleOpen(r)}
                    >
                      Otwórz
                    </button>
                    <button
                      className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50"
                      disabled={isBusy}
                      onClick={() => handlePdf(r)}
                    >
                      {isBusy ? '⏳…' : '📦 Pobierz'}
                    </button>
                    <button
                      className="btn-sm bg-red-600 text-white hover:bg-red-700"
                      onClick={() => handleDelete(r)}
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
