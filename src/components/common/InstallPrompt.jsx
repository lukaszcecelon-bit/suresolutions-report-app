import { useEffect, useState } from 'react'

const DISMISS_KEY = 'suresolutions.install.dismissed'

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1') return
    if (window.matchMedia('(display-mode: standalone)').matches) return

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
      <div className="bg-white border border-gray-300 rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">📲</div>
          <div className="flex-1">
            <div className="font-semibold text-sure-dark">Zainstaluj aplikację</div>
            <div className="text-sm text-gray-600 mt-1">
              Dodaj „SureSolutions Raporty" na ekran główny — szybszy dostęp i działa offline.
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={install} className="btn-primary text-sm py-2 px-3 flex-1">Zainstaluj</button>
              <button onClick={dismiss} className="btn-secondary text-sm py-2 px-3">Później</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
