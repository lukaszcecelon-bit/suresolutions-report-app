import { useEffect, useState } from 'react'
import { useSW } from './SWManager.jsx'

// Renders the "new version available" and "ready to work offline" banners.
// The SW state lives in SWProvider; this component is purely a consumer.
export default function UpdatePrompt() {
  const { needRefresh, offlineReady, setNeedRefresh, setOfflineReady, updateNow } = useSW()
  const [showOffline, setShowOffline] = useState(false)

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
            <button onClick={updateNow} className="bg-white text-sure-blue px-3 py-1.5 rounded font-medium text-sm flex-1">Odśwież</button>
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
