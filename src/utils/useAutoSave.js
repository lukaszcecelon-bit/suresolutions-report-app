import { useEffect, useRef, useState } from 'react'
import { upsert, getById } from './storage.js'
import { isBlankReport } from './reportFields.js'

// Debounced auto-save for report state.
//
// Replaces the inline pattern in each report component:
//   useEffect(() => { if (!isFirst) upsert(report) }, [report])
//
// Improvements:
//   - 300ms debounce: rapid typing in textareas causes JSON.stringify + writes
//     to localStorage to fire ~once per pause instead of once per keystroke.
//     Visibly smoother form input on older phones.
//   - Save-on-unmount: if the user navigates away mid-debounce, the latest
//     in-memory report is still flushed to storage so no edit is lost.
//   - Skips the very first effect (mount) so loading a saved report doesn't
//     immediately re-write it.
//
// Returns: timestamp (ms) of the most recent successful save, suitable for
// feeding into <AutoSaveIndicator savedAt={...} />.
export function useAutoSave(report, { debounceMs = 300 } = {}) {
  const [savedAt, setSavedAt] = useState(null)
  const isFirst = useRef(true)
  const reportRef = useRef(report)
  // „Brudny" = raport zmienił się PO zamontowaniu (realna edycja użytkownika).
  // Bez tego cleanup na unmount robił bezwarunkowy upsert → samo OTWARCIE i
  // zamknięcie raportu (zero zmian) stemplowało `updatedAt`, przez co raport
  // udawał „ostatnio edytowany" (skakał na górze Start/Reports, mieszał recency
  // podpowiedzi). Teraz flush na unmount zachodzi tylko gdy faktycznie brudny —
  // a nietknięty świeży raport nie zostaje zapisany jako pusty szkic.
  const dirtyRef = useRef(false)
  // Czy ten raport JUŻ jest w bazie. Raport otwarty z listy zachowuje się
  // dokładnie jak dotąd (każda zmiana zapisywana); bramka pustego szkicu dotyczy
  // wyłącznie świeżo utworzonych, jeszcze nigdy nie zapisanych raportów.
  const savedOnceRef = useRef(!!getById(report.id))

  // Keep the latest report value in a ref so the unmount cleanup can flush it
  // regardless of which render the unmount happens on.
  useEffect(() => { reportRef.current = report }, [report])

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    // NOWY, PUSTY raport nie trafia do bazy (v1.2). Wcześniej wystarczyło jedno
    // przypadkowe tapnięcie — np. w przełącznik statusu wizyty — żeby raport bez
    // żadnej treści osiadł w bazie na stałe.
    if (!savedOnceRef.current && isBlankReport(report)) return
    dirtyRef.current = true
    const t = setTimeout(() => {
      upsert(report)
      savedOnceRef.current = true
      dirtyRef.current = false
      setSavedAt(Date.now())
    }, debounceMs)
    return () => clearTimeout(t)
  }, [report, debounceMs])

  // Final flush on unmount — tylko gdy jest niezapisana zmiana (pending debounce),
  // żeby nie bumpować updatedAt przy samym podejrzeniu raportu.
  useEffect(() => () => {
    if (dirtyRef.current) upsert(reportRef.current)
  }, [])

  return savedAt
}
