import { useEffect, useState } from 'react'
import { useToast } from './Toast.jsx'
import { backupAllReports } from '../../utils/syncPackage.js'

// Globalny baner ostrzeżeń o pamięci urządzenia (v0.47). Reaguje na zdarzenie
// `suresolutions:storage-full` emitowane przez storage.upsert() gdy zapis do
// localStorage padnie na quota — inaczej autosave „udaje sukces", a praca ginie
// po reloadzie. Baner jest uporczywy (nie znika sam) i oferuje natychmiastowy
// backup, bo to sytuacja realnej utraty danych.
export default function StorageAlerts() {
  const toast = useToast()
  const [full, setFull] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onFull = () => setFull(true)
    window.addEventListener('suresolutions:storage-full', onFull)
    return () => window.removeEventListener('suresolutions:storage-full', onFull)
  }, [])

  if (!full) return null

  const runBackup = async () => {
    if (busy) return
    setBusy(true)
    try {
      const n = await backupAllReports()
      toast.success(`Backup gotowy (${n}) — teraz usuń stare raporty`)
    } catch (e) {
      toast.error('Nie udało się zrobić backupu: ' + (e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[120] bg-red-600 text-white shadow-lg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="text-lg leading-none shrink-0" aria-hidden="true">⚠️</span>
        <div className="flex-1 text-sm leading-snug">
          <span className="font-semibold">Pamięć urządzenia pełna.</span>{' '}
          Ostatnie zmiany mogą się nie zapisać. Zrób backup i usuń stare raporty, zanim praca przepadnie.
        </div>
        <button
          onClick={runBackup}
          disabled={busy}
          className="shrink-0 text-sm font-medium px-3 py-1.5 rounded bg-white text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {busy ? '⏳ Backup…' : '💾 Zrób backup'}
        </button>
        <button
          onClick={() => setFull(false)}
          className="shrink-0 text-white/80 hover:text-white text-lg leading-none px-1"
          aria-label="Ukryj ostrzeżenie"
        >
          ×
        </button>
      </div>
    </div>
  )
}
