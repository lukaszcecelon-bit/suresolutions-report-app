import { createContext, useContext, useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Single owner of the PWA service-worker registration. Exposes:
//   - needRefresh / offlineReady — banner state, consumed by <UpdatePrompt>
//   - updateNow()                 — activates pending SW and reloads the page
//   - checkForUpdate()            — manually triggers an update check, returns
//                                   true when a new version is waiting after
//                                   the call (useful for "tap version to refresh")
//
// Also adds:
//   - visibility-change auto-check (when the app comes back to the foreground)
//   - periodic auto-check every 30 minutes while the app is open
const SWContext = createContext({
  needRefresh: false, offlineReady: false,
  setNeedRefresh: () => {}, setOfflineReady: () => {},
  updateNow: () => {},
  checkForUpdate: async () => false,
})

export function SWProvider({ children }) {
  const regRef = useRef(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      regRef.current = r
      if (r) {
        // Periodic background check while app is open
        const interval = setInterval(() => {
          r.update().catch(() => {})
        }, 30 * 60 * 1000) // 30 min
        // Best-effort cleanup if the SW is ever unregistered; this provider
        // lives for the lifetime of the app anyway.
        r.addEventListener?.('unregister', () => clearInterval(interval))
      }
    },
    onRegisterError(error) {
      console.warn('SW registration error', error)
    },
  })

  // When the app returns to the foreground (tab focus, return from
  // background on phone), force a fresh update check.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && regRef.current) {
        regRef.current.update().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  const updateNow = () => updateServiceWorker(true)

  const checkForUpdate = async () => {
    const r = regRef.current
    if (!r) return false
    try {
      await r.update()
      // Give the browser a moment to install the new SW if one is available.
      await new Promise((res) => setTimeout(res, 1200))
      return !!r.waiting
    } catch (e) {
      console.warn('SW update check failed', e)
      return false
    }
  }

  return (
    <SWContext.Provider value={{
      needRefresh, offlineReady,
      setNeedRefresh, setOfflineReady,
      updateNow, checkForUpdate,
    }}>
      {children}
    </SWContext.Provider>
  )
}

export function useSW() { return useContext(SWContext) }
