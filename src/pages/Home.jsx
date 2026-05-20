import { useEffect, useMemo, useState } from 'react'
import { loadAll, remove, upsert, cloneReport } from '../utils/storage.js'
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

const TYPE_FILTER_ITEMS = [
  { key: 'commissioning', label: '▶ Uruchomienie' },
  { key: 'service',       label: '🔧 Serwis' },
  { key: 'prototype',     label: '🧪 Prototyp' },
]

const STATUS_FILTER_ITEMS = [
  { key: 'draft',     label: 'Robocze' },
  { key: 'completed', label: 'Ukończone' },
]

const ONBOARDING_KEY = 'suresolutions.onboarding.v1.dismissed'

// Polish-aware case-insensitive substring match (strips diacritics on both sides)
function normalize(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

function getSearchableText(r) {
  const parts = []
  const push = (v) => { if (v && typeof v === 'string') parts.push(v) }
  const h = r.header || {}
  push(h.reportNumber); push(h.projectName); push(h.machineName); push(h.author)
  if (r.type === 'service') {
    push(r.visit?.client); push(r.visit?.location)
    push(r.observations); push(r.recommendations)
    for (const a of (r.actions || [])) { push(a.description); push(a.category) }
    for (const p of (r.parts || [])) { push(p.name); push(p.catalogNo); push(p.comment) }
  } else if (r.type === 'prototype') {
    push(r.info?.component); push(r.info?.goal)
    push(r.observations); push(r.decisionNotes); push(r.conditions?.setup)
    for (const p of (r.conditions?.params || [])) { push(p.key); push(p.value) }
    for (const p of (r.points || [])) { push(p.description); push(p.comment) }
  } else if (r.type === 'commissioning') {
    push(r.observations); push(r.conclusions)
    for (const s of (r.stops || [])) { push(s.comment); push(s.customReason); push(s.reason) }
  }
  return normalize(parts.join(' '))
}

export default function Home({ navigate }) {
  const [reports, setReports] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState(new Set())

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

  const handleClone = (r) => {
    const fresh = cloneReport(r)
    upsert(fresh)
    refresh()
    toast.success('Utworzono kopię — rozpocznij edycję nowego raportu')
    if (fresh.type === 'commissioning') navigate(`commissioning/${fresh.id}`)
    else if (fresh.type === 'service') navigate(`service/${fresh.id}`)
    else if (fresh.type === 'prototype') navigate(`prototype/${fresh.id}`)
  }

  // Sort by updatedAt desc (most recent first)
  const sorted = useMemo(() => [...reports].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  }), [reports])

  const mostRecentId = sorted[0]?.id

  // Apply search + filters
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return sorted.filter((r) => {
      if (typeFilter.size > 0 && !typeFilter.has(r.type)) return false
      const isCompleted = r.status === 'completed'
      const statusKey = isCompleted ? 'completed' : 'draft'
      if (statusFilter.size > 0 && !statusFilter.has(statusKey)) return false
      if (q && !getSearchableText(r).includes(q)) return false
      return true
    })
  }, [sorted, query, typeFilter, statusFilter])

  const toggleFilter = (set, setter, key) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key); else next.add(key)
    setter(next)
  }

  const fmtUpdated = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    if (isToday) return `dziś ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    return d.toISOString().slice(0, 10)
  }

  const hasFiltersActive = query.trim() || typeFilter.size > 0 || statusFilter.size > 0

  return (
    <div className="space-y-6">
      {showOnboarding && (
        <div className="card bg-sure-blue/5 border-sure-blue/30">
          <div className="flex items-start gap-3">
            <div className="text-3xl">👋</div>
            <div className="flex-1">
              <h2 className="font-semibold text-sure-dark dark:text-gray-100">Witaj w Raporty SURE</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
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

        {/* Search + filters — only show if there's anything to filter */}
        {sorted.length > 0 && (
          <div className="space-y-2 mb-4">
            <div className="relative">
              <input
                type="search"
                inputMode="search"
                placeholder="🔍 Szukaj (numer, projekt, klient, treść…)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="field-input pr-10"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute top-1/2 -translate-y-1/2 right-2 w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 text-xs"
                  aria-label="Wyczyść"
                >✕</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTER_ITEMS.map((t) => {
                const active = typeFilter.has(t.key)
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleFilter(typeFilter, setTypeFilter, t.key)}
                    className={
                      'text-xs px-3 py-1.5 rounded-full font-medium transition border ' +
                      (active
                        ? 'bg-sure-blue text-white border-transparent'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500')
                    }
                  >
                    {t.label}
                  </button>
                )
              })}
              <span className="w-px self-stretch bg-gray-200 dark:bg-gray-700 mx-1" />
              {STATUS_FILTER_ITEMS.map((s) => {
                const active = statusFilter.has(s.key)
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleFilter(statusFilter, setStatusFilter, s.key)}
                    className={
                      'text-xs px-3 py-1.5 rounded-full font-medium transition border ' +
                      (active
                        ? (s.key === 'completed'
                            ? 'bg-emerald-600 text-white border-transparent'
                            : 'bg-amber-500 text-white border-transparent')
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-500')
                    }
                  >
                    {s.label}
                  </button>
                )
              })}
              {hasFiltersActive && (
                <button
                  onClick={() => { setQuery(''); setTypeFilter(new Set()); setStatusFilter(new Set()) }}
                  className="ml-auto text-xs text-sure-blue px-2 py-1.5 hover:underline"
                >
                  Wyczyść filtry
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {filtered.length === sorted.length
                ? `${sorted.length} ${sorted.length === 1 ? 'raport' : sorted.length < 5 ? 'raporty' : 'raportów'}`
                : `${filtered.length} z ${sorted.length}`}
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="card text-center text-gray-500 dark:text-gray-400">
            Brak zapisanych raportów. Kliknij <span className="font-medium">„+ Nowy raport"</span> aby zacząć.
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center text-gray-500 dark:text-gray-400">
            Nic nie pasuje do bieżących filtrów. Zmień zapytanie lub
            <button onClick={() => { setQuery(''); setTypeFilter(new Set()); setStatusFilter(new Set()) }}
              className="ml-1 text-sure-blue underline">wyczyść filtry</button>.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const isRecent = r.id === mostRecentId && !hasFiltersActive
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
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
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
                          ? 'border-emerald-400 text-emerald-700 bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-300 dark:bg-emerald-900/30'
                          : 'border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-500/50 dark:text-amber-300 dark:bg-amber-900/30')
                      }>
                        {completed ? 'Ukończony' : 'Roboczy'}
                      </span>
                    </div>
                    <div className="mt-1.5 font-semibold text-sure-dark dark:text-gray-100 truncate">
                      {r.header?.reportNumber || '(brak nr)'} · {r.header?.projectName || '(brak projektu)'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Maszyna: {r.header?.machineName || '—'} · Data: {r.header?.date || '—'} · Autor: {r.header?.author || '—'}
                    </div>
                    {r.updatedAt && (
                      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        Zmienione {fmtUpdated(r.updatedAt)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
                      onClick={() => handleOpen(r)}
                    >
                      Otwórz
                    </button>
                    <button
                      className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
                      onClick={() => handleClone(r)}
                      title="Utwórz kopię tego raportu jako szablon"
                    >
                      📋 Duplikuj
                    </button>
                    <button
                      className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600"
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
