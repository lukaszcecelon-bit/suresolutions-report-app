import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdatePrompt() {
  const [showOffline, setShowOffline] = useState(false)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      console.log('SW registered:', swUrl)
    },
    onRegisterError(error) {
      console.warn('SW registration error:', error)
    },
  })

  useEffect(() => {
    if (offlineReady) {
      setShowOffline(true)
      const t = setTimeout(() => { setShowOffline(false); setOfflineReady(false) }, 4000)
      return () => clearTimeout(t)
    }
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !showOffline) return null

  return (
    <div className="fixed top-20 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-40">
      {needRefresh && (
        <div className="bg-sure-blue text-white rounded-xl shadow-lg p-4 mb-2">
          <div className="font-semibold">Nowa wersja aplikacji</div>
          <div className="text-sm opacity-90 mt-1">Kliknij aby odświeżyć i załadować nową wersję.</div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => updateServiceWorker(true)} className="bg-white text-sure-blue px-3 py-1.5 rounded font-medium text-sm flex-1">Odśwież</button>
            <button onClick={() => setNeedRefresh(false)} className="bg-white/20 text-white px-3 py-1.5 rounded text-sm">Później</button>
          </div>
        </div>
      )}
      {showOffline && (
        <div className="bg-emerald-600 text-white rounded-xl shadow-lg p-3 text-sm">
          ✓ Aplikacja gotowa do pracy offline
        </div>
      )}
    </div>
  )
}
