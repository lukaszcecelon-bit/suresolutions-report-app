import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const ToastContext = createContext({
  toast: { success: () => {}, error: () => {}, info: () => {} },
  confirm: () => Promise.resolve(false),
})

let nextId = 1

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const [confirmState, setConfirmState] = useState(null)

  const dismiss = useCallback((id) => {
    setItems((arr) => arr.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((type, message, opts = {}) => {
    const id = nextId++
    setItems((arr) => [...arr, { id, type, message }])
    // Short by default so the toast doesn't sit over the action area for long.
    // Errors get a touch longer because they need to be read.
    const duration = opts.duration ?? (type === 'error' ? 3500 : 1800)
    setTimeout(() => dismiss(id), duration)
  }, [dismiss])

  const toast = useMemo(() => ({
    success: (m, o) => push('success', m, o),
    error:   (m, o) => push('error', m, o),
    info:    (m, o) => push('info', m, o),
  }), [push])

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        message,
        title: opts.title || 'Potwierdź',
        confirmLabel: opts.confirmLabel || 'Tak',
        cancelLabel: opts.cancelLabel || 'Anuluj',
        variant: opts.variant || 'primary', // 'primary' | 'danger'
        resolve,
      })
    })
  }, [])

  const closeConfirm = (result) => {
    if (confirmState) {
      confirmState.resolve(result)
      setConfirmState(null)
    }
  }

  // A11y dla modala potwierdzenia: focus na przycisku po otwarciu, Escape =
  // anuluj, Tab uwięziony między przyciskami, powrót fokusu po zamknięciu.
  const dialogRef = useRef(null)
  const prevFocusRef = useRef(null)
  useEffect(() => {
    if (!confirmState) return
    prevFocusRef.current = document.activeElement
    const focusables = () => (dialogRef.current ? [...dialogRef.current.querySelectorAll('button')] : [])
    const btns = focusables()
    ;(btns[btns.length - 1] || dialogRef.current)?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeConfirm(false) }
      else if (e.key === 'Tab') {
        const f = focusables()
        if (f.length < 2) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      try { prevFocusRef.current?.focus?.() } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState])

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasty NA DOLE (bliżej kciuka, nad dolnym paskiem), ogłaszane przez
          czytnik ekranu. Tap gdziekolwiek zamyka; obszar wokół przepuszcza
          kliknięcia do strony (pointer-events-none na wrapperze). */}
      <div
        role="status"
        aria-live="polite"
        className="fixed z-[100] flex flex-col gap-2 pointer-events-none inset-x-4 sm:inset-x-auto sm:right-4 items-stretch sm:items-end"
        style={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom))' }}
      >
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismiss(t.id)}
            className={`toast toast-${t.type} slide-in-right cursor-pointer text-left`}
          >
            <span className="text-base leading-none">
              {t.type === 'success' && '✓'}
              {t.type === 'error' && '⚠'}
              {t.type === 'info' && 'ℹ'}
            </span>
            <div className="flex-1 text-sm leading-snug">{t.message}</div>
            <span className="text-white/70 text-base leading-none" aria-hidden="true">×</span>
          </button>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md p-5 space-y-4 fade-in"
          >
            <div>
              <h3 id="confirm-title" className="text-lg font-bold text-sure-dark dark:text-gray-100">{confirmState.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5 whitespace-pre-line">{confirmState.message}</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button onClick={() => closeConfirm(false)} className="btn-secondary flex-1">
                {confirmState.cancelLabel}
              </button>
              <button
                onClick={() => closeConfirm(true)}
                className={confirmState.variant === 'danger' ? 'btn-danger flex-1' : 'btn-primary flex-1'}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() { return useContext(ToastContext).toast }
export function useConfirm() { return useContext(ToastContext).confirm }
