import { useEffect, useRef, useState } from 'react'
import { upsert } from './storage.js'

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

  // Keep the latest report value in a ref so the unmount cleanup can flush it
  // regardless of which render the unmount happens on.
  useEffect(() => { reportRef.current = report }, [report])

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    dirtyRef.current = true
    const t = setTimeout(() => {
      upsert(report)
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
