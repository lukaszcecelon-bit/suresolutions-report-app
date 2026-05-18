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

  // Keep the latest report value in a ref so the unmount cleanup can flush it
  // regardless of which render the unmount happens on.
  useEffect(() => { reportRef.current = report }, [report])

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    const t = setTimeout(() => {
      upsert(report)
      setSavedAt(Date.now())
    }, debounceMs)
    return () => clearTimeout(t)
  }, [report, debounceMs])

  // Final flush on unmount — captures the latest in-memory value even when a
  // debounced save was still pending.
  useEffect(() => () => {
    upsert(reportRef.current)
  }, [])

  return savedAt
}
