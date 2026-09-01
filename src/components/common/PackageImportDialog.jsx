import { useEffect, useState } from 'react'
import { readPackage, importPackage } from '../../utils/syncPackage.js'
import { useToast } from './Toast.jsx'
import ToggleGroup from './ToggleGroup.jsx'
import { TYPE_LABELS, TYPE_ICONS } from '../../utils/reportMeta.js'

// Etykieta typu z jednego źródła (reportMeta) — wcześniej lokalna mapa gubiła
// typy „lesson" i „complaint" (import backupu z lekcją/reklamacją pokazywał
// surowy klucz zamiast nazwy).
const typeLabel = (t) => `${TYPE_ICONS[t] || '📄'} ${TYPE_LABELS[t] || t}`

// Powłoka modala — DEFINIOWANA W MODULE, nie w komponencie. Wcześniej `const
// Wrap` żył wewnątrz komponentu → przy każdym renderze był nowym typem, więc
// React remontował całą treść (reset scrolla listy konfliktów i utrata focusu
// przy każdym tapnięciu w toggle rozwiązania konfliktu).
function Wrap({ children }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-lg p-5 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto fade-in">
        {children}
      </div>
    </div>
  )
}

const CONFLICT_ITEMS = [
  { key: 'overwrite', label: 'Nadpisz',  icon: '↻',  activeClass: 'bg-amber-500 text-white border-transparent font-semibold' },
  { key: 'copy',      label: 'Kopia',    icon: '📋', activeClass: 'bg-sure-blue text-white border-transparent font-semibold' },
  { key: 'skip',      label: 'Pomiń',    icon: '✕',  activeClass: 'bg-gray-500 text-white border-transparent font-semibold' },
]

function fmtDateTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// Modal z preview paczki, conflict resolution per raport i akcją importu.
// `file` to wybrany File object z input/drop. `onClose` zamyka modal.
// `onImported({imported, skipped})` callback po sukcesie.
export default function PackageImportDialog({ file, onClose, onImported }) {
  const [state, setState] = useState('reading') // reading | preview | importing | done | error
  const [error, setError] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [payload, setPayload] = useState(null)
  const [conflicts, setConflicts] = useState([])
  const [zipRef, setZipRef] = useState(null)
  const [resolutions, setResolutions] = useState({})
  const [result, setResult] = useState(null)
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await readPackage(file)
        if (cancelled) return
        setZipRef(r.zip)
        setManifest(r.manifest)
        setPayload(r.payload)
        setConflicts(r.conflicts)
        // Domyślnie: jeśli paczka nowsza — nadpisz, jeśli starsza — kopia.
        // To "smart default" — user widzi już sensowny wybór, może go zmienić.
        const defaults = {}
        for (const c of r.conflicts) {
          const inT = new Date(c.incoming.updatedAt || 0).getTime()
          const exT = new Date(c.existing.updatedAt || 0).getTime()
          defaults[c.id] = inT > exT ? 'overwrite' : 'copy'
        }
        setResolutions(defaults)
        setState('preview')
      } catch (e) {
        if (cancelled) return
        setError(e.message || String(e))
        setState('error')
      }
    })()
    return () => { cancelled = true }
  }, [file])

  const setResolution = (id, action) => setResolutions((m) => ({ ...m, [id]: action }))
  const applyToAll = (action) => {
    setResolutions((m) => {
      const next = { ...m }
      for (const c of conflicts) next[c.id] = action
      return next
    })
  }

  const handleImport = async () => {
    setState('importing')
    try {
      const res = await importPackage(zipRef, payload, resolutions)
      setResult(res)
      setState('done')
    } catch (e) {
      setError(e.message || String(e))
      setState('error')
    }
  }

  const handleClose = () => {
    if (result) onImported?.(result)
    onClose?.()
  }

  if (state === 'reading' || state === 'importing') {
    return (
      <Wrap>
        <div className="flex items-center gap-3 py-4">
          <div className="w-8 h-8 border-4 border-sure-blue/20 border-t-sure-blue rounded-full animate-spin shrink-0" />
          <div className="text-sm text-gray-700 dark:text-gray-200">
            {state === 'reading' ? 'Wczytywanie paczki…' : 'Importowanie raportów…'}
          </div>
        </div>
      </Wrap>
    )
  }

  if (state === 'error') {
    return (
      <Wrap>
        <h3 className="text-lg font-bold text-red-600 dark:text-red-400">Błąd importu</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300">{error}</p>
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-secondary">Zamknij</button>
        </div>
      </Wrap>
    )
  }

  if (state === 'done') {
    return (
      <Wrap>
        <h3 className="text-lg font-bold text-sure-dark dark:text-gray-100">✓ Import zakończony</h3>
        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
          <div>Zaimportowano: <strong>{result.imported.length}</strong> raport(ów)</div>
          {result.skipped.length > 0 && (
            <div>Pominięto: <strong>{result.skipped.length}</strong> raport(ów)</div>
          )}
        </div>
        <div className="flex justify-end">
          <button onClick={handleClose} className="btn-primary">OK</button>
        </div>
      </Wrap>
    )
  }

  // state === 'preview'
  const isSingle = payload?.mode === 'single'
  const reports = isSingle ? [payload.report] : payload.reports
  const totalCount = reports.length
  const newCount = totalCount - conflicts.length
  const stats = manifest?.stats || {}

  return (
    <Wrap>
      <div>
        <h3 className="text-lg font-bold text-sure-dark dark:text-gray-100">
          {isSingle ? 'Importowanie raportu' : 'Importowanie kopii zapasowej'}
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          {isSingle ? (
            <>
              <strong>{payload.report.header?.reportNumber || '(bez numeru)'}</strong>
              {' '}— {typeLabel(payload.report.type)}
            </>
          ) : (
            <>Paczka z <strong>{totalCount}</strong> raportami</>
          )}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Wyeksportowano: {fmtDateTime(manifest?.exportedAt)}
          {' · '}
          📷 {stats.photoCount || 0} zdjęć · 🎬 {stats.videoCount || 0} wideo
        </p>
        {/* Plik z „Przenieś na inne urządzenie" niesie zdjęcia w rozdzielczości
            raportu i pomija wideo (v1.6) — mówimy o tym przed importem, żeby
            nikt nie szukał potem brakujących filmów. */}
        {stats.videosOmitted > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            🎬 Ten plik nie zawiera {stats.videosOmitted} pliku/ów wideo — zostały na urządzeniu,
            z którego wysłano raport (plik do przenoszenia musi zmieścić się w mailu).
          </p>
        )}
      </div>

      {/* Brak konfliktów — proste podsumowanie */}
      {conflicts.length === 0 && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          ✓ Wszystkie {totalCount} raport(y) to nowe wpisy — brak konfliktów do rozwiązania.
        </div>
      )}

      {/* Konflikty — per każdy radio z 3 akcjami */}
      {conflicts.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>Konflikt:</strong> {conflicts.length} raport(ów) o tym id już istnieje lokalnie.
            {' '}Wybierz akcję dla każdego:
          </div>

          {conflicts.length > 1 && (
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="text-gray-500 dark:text-gray-400">Zastosuj do wszystkich:</span>
              <button onClick={() => applyToAll('overwrite')} className="px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60">↻ Nadpisz</button>
              <button onClick={() => applyToAll('copy')} className="px-2 py-1 rounded bg-sure-blue/10 text-sure-blue dark:bg-sure-blue/30 dark:text-sky-200 hover:bg-sure-blue/20">📋 Kopia</button>
              <button onClick={() => applyToAll('skip')} className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600">✕ Pomiń</button>
            </div>
          )}

          <div className="space-y-3 max-h-80 overflow-y-auto -mx-1 px-1">
            {conflicts.map((c) => {
              const inT = new Date(c.incoming.updatedAt || 0).getTime()
              const exT = new Date(c.existing.updatedAt || 0).getTime()
              const incomingNewer = inT > exT
              return (
                <div key={c.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-700/40">
                  <div>
                    <div className="font-medium text-sm text-sure-dark dark:text-gray-100">
                      {c.incoming.header?.reportNumber || '(bez numeru)'}
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-normal ml-2">
                        {typeLabel(c.incoming.type)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Lokalna: {fmtDateTime(c.existing.updatedAt)}
                      {' · '}
                      Paczka: {fmtDateTime(c.incoming.updatedAt)}
                      {incomingNewer ? (
                        <span className="ml-1 text-amber-700 dark:text-amber-300 font-medium">(paczka nowsza)</span>
                      ) : (
                        <span className="ml-1 text-emerald-700 dark:text-emerald-300 font-medium">(lokalna nowsza)</span>
                      )}
                    </div>
                  </div>
                  <ToggleGroup
                    size="sm"
                    items={CONFLICT_ITEMS}
                    value={resolutions[c.id] || 'skip'}
                    onChange={(action) => setResolution(c.id, action)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Podsumowanie akcji */}
      {conflicts.length > 0 && (
        <div className="text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
          {newCount > 0 && <div>• Nowe (zostaną dodane): <strong>{newCount}</strong></div>}
          {Object.values(resolutions).filter((v) => v === 'overwrite').length > 0 && (
            <div>• Nadpisanie: <strong>{Object.values(resolutions).filter((v) => v === 'overwrite').length}</strong></div>
          )}
          {Object.values(resolutions).filter((v) => v === 'copy').length > 0 && (
            <div>• Stworzenie kopii: <strong>{Object.values(resolutions).filter((v) => v === 'copy').length}</strong></div>
          )}
          {Object.values(resolutions).filter((v) => v === 'skip').length > 0 && (
            <div>• Pominiętych: <strong>{Object.values(resolutions).filter((v) => v === 'skip').length}</strong></div>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onClose} className="btn-secondary flex-1">
          Anuluj
        </button>
        <button onClick={handleImport} className="btn-primary flex-1">
          Importuj
        </button>
      </div>
    </Wrap>
  )
}
