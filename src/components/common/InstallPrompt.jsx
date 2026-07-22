import { useEffect, useState } from 'react'

const DISMISS_KEY = 'suresolutions.install.dismissed'

// iOS Safari NIE odpala `beforeinstallprompt` — jedyna droga to systemowe
// „Udostępnij → Dodaj do ekranu głównego". Wykrywamy iPhone/iPada i pokazujemy
// instrukcję zamiast przycisku instalacji (którego iOS nie oferuje).
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '')
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    if (isStandalone()) return

    // iOS: brak zdarzenia instalacji → pokaż instrukcję po krótkiej zwłoce
    // (nie wyskakuj od razu na wejściu; daj się rozejrzeć).
    if (isIOS()) {
      const t = setTimeout(() => { setIos(true); setShow(true) }, 2500)
      return () => clearTimeout(t)
    }

    const onBefore = (e) => {
      e.preventDefault()
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBefore)
    return () => window.removeEventListener('beforeinstallprompt', onBefore)
  }, [])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setShow(false)
  }

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch {}
    setShow(false)
    setDeferred(null)
  }

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-40">
      <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">📲</div>
          <div className="flex-1">
            <div className="font-semibold text-sure-dark dark:text-gray-100">Zainstaluj aplikację</div>
            {ios ? (
              <>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Dodaj „Raporty SURE" na ekran główny: dotknij
                  {' '}<span className="font-semibold">Udostępnij</span>{' '}
                  <span aria-hidden="true">⬆️</span>, a potem
                  {' '}<span className="font-semibold">„Do ekranu początkowego"</span>.
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={dismiss} className="btn-secondary text-sm py-2 px-3">Rozumiem</button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Dodaj „Raporty SURE" na ekran główny — szybszy dostęp i działa offline.
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={install} className="btn-primary text-sm py-2 px-3 flex-1">Zainstaluj</button>
                  <button onClick={dismiss} className="btn-secondary text-sm py-2 px-3">Później</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
