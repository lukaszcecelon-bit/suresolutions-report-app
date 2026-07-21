import { useEffect, useState } from 'react'

// Pełnoekranowy overlay pokazywany podczas generowania paczki (PDF+ZIP).
// pdfGenerator nie raportuje realnego postępu, więc rotujemy hasła co 1.5s
// żeby użytkownik czuł że coś się dzieje (i widział, że to wieloetapowy proces).
// Animowane skeleton-bary pod spodem dodają poczucie "budowania" raportu.
const MESSAGES = [
  'Przygotowanie danych…',
  'Generowanie PDF…',
  'Pakowanie multimediów…',
  'Finalizacja paczki…',
]

export default function LoadingOverlay({ visible, title = 'Generowanie raportu…' }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!visible) { setIdx(0); return }
    const handle = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 1500)
    return () => clearInterval(handle)
  }, [visible])

  if (!visible) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[120] flex items-center justify-center p-4" role="status" aria-live="polite" aria-busy="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-xs w-full text-center fade-in">
        <div className="mb-4 flex justify-center">
          <div className="w-12 h-12 border-4 border-sure-blue/20 border-t-sure-blue rounded-full animate-spin" />
        </div>
        <div className="font-semibold text-sure-dark dark:text-gray-100 mb-1">{title}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400 min-h-[20px]">{MESSAGES[idx]}</div>
        <div className="mt-4 space-y-2">
          <div className="skeleton h-2 rounded w-full" />
          <div className="skeleton h-2 rounded w-3/4 mx-auto" />
          <div className="skeleton h-2 rounded w-5/6 mx-auto" />
        </div>
      </div>
    </div>
  )
}
