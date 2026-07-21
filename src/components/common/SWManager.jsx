import { createContext, useContext, useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Single owner of the PWA service-worker registration. Exposes:
//   - needRefresh / offlineReady — banner state, consumed by <UpdatePrompt>
//   - updateNow()                 — activates pending SW and reloads the page
//   - checkForUpdate()            — manually triggers an update check, returns
//                                   true when a new version is installing/waiting
//   - forceUpdate()               — escape hatch dla upartego iOS: czyści cache
//                                   i przeładowuje (pobiera świeży kod z sieci)
//
// Also adds:
//   - visibility-change auto-check (when the app comes back to the foreground)
//   - periodic auto-check every 30 minutes while the app is open
const SWContext = createContext({
  needRefresh: false, offlineReady: false,
  setNeedRefresh: () => {}, setOfflineReady: () => {},
  updateNow: () => {},
  checkForUpdate: async () => false,
  forceUpdate: async () => {},
})

// Pobierz rejestrację SW — z ref (szybka ścieżka) albo z API (gdy ref pusty,
// np. tuż po starcie lub po przywróceniu z tła na telefonie).
async function getRegistration(regRef) {
  if (regRef.current) return regRef.current
  try {
    const r = await navigator.serviceWorker?.getRegistration?.()
    if (r) regRef.current = r
    return r || null
  } catch {
    return null
  }
}

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

  // Aktywuj oczekujący SW i przeładuj. updateServiceWorker(true) sam przeładowuje
  // na zdarzenie controllerchange — ale na iOS w trybie standalone to zdarzenie
  // bywa POMIJANE, więc dokładamy zapasowy reload po 2,5 s (jeśli strona wciąż
  // żyje = pierwszy reload nie zaszedł).
  const updateNow = async () => {
    try { await updateServiceWorker(true) } catch (e) { console.warn('updateNow failed', e) }
    setTimeout(() => { try { window.location.reload() } catch {} }, 2500)
  }

  // Sprawdzenie aktualizacji odporne na wolny telefon: po r.update() czekamy aż
  // NOWY worker faktycznie przejdzie w stan 'installed' (=> 'waiting' => banner),
  // a nie tylko przez sztywne 1,2 s (na mobile instalacja precache trwa dłużej,
  // przez co stara wersja zwracała fałszywe „brak aktualizacji").
  const checkForUpdate = async () => {
    const r = await getRegistration(regRef)
    if (!r) return false
    try {
      await r.update()
      if (r.waiting) return true
      const installing = r.installing
      if (!installing) return false
      return await new Promise((resolve) => {
        let settled = false
        const finish = (v) => { if (!settled) { settled = true; resolve(v) } }
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' || installing.state === 'activated') finish(true)
          else if (installing.state === 'redundant') finish(false)
        })
        // Zabezpieczenie czasowe — na wypadek gdyby statechange nie doszło.
        setTimeout(() => finish(!!r.waiting), 15000)
      })
    } catch (e) {
      console.warn('SW update check failed', e)
      return false
    }
  }

  // Escape hatch: gdy zwykły check nic nie daje (uparta zainstalowana PWA na
  // iOS), czyścimy WSZYSTKIE cache Workboxa i przeładowujemy. Po reloadzie stary
  // SW nie ma już z czego serwować → index.html i JS lecą z sieci (świeże).
  // Dane użytkownika są w IndexedDB (nie w Cache API), więc NIE giną.
  const forceUpdate = async () => {
    try {
      const r = await getRegistration(regRef)
      if (r) {
        await r.update().catch(() => {})
        if (r.waiting) { try { r.waiting.postMessage({ type: 'SKIP_WAITING' }) } catch {} }
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch (e) {
      console.warn('forceUpdate failed', e)
    } finally {
      window.location.reload()
    }
  }

  return (
    <SWContext.Provider value={{
      needRefresh, offlineReady,
      setNeedRefresh, setOfflineReady,
      updateNow, checkForUpdate, forceUpdate,
    }}>
      {children}
    </SWContext.Provider>
  )
}

export function useSW() { return useContext(SWContext) }
