import { createContext, useCallback, useContext, useMemo, useState } from 'react'

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

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toasts — tap anywhere on toast to dismiss; the surrounding area lets
          clicks pass through to the page (pointer-events-none on wrapper). */}
      <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`toast toast-${t.type} slide-in-right cursor-pointer`}
          >
            <span className="text-base leading-none">
              {t.type === 'success' && '✓'}
              {t.type === 'error' && '⚠'}
              {t.type === 'info' && 'ℹ'}
            </span>
            <div className="flex-1 text-sm leading-snug">{t.message}</div>
            <span
              className="text-white/70 text-base leading-none"
              aria-label="Zamknij"
            >×</span>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/60 z-[110] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-4 fade-in">
            <div>
              <h3 className="text-lg font-bold text-sure-dark">{confirmState.title}</h3>
              <p className="text-sm text-gray-600 mt-1.5 whitespace-pre-line">{confirmState.message}</p>
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
