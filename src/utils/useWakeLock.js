import { useEffect } from 'react'

// Trzyma ekran wybudzony gdy `active` === true (Screen Wake Lock API).
// Użycie: długa sesja uruchomienia z live-timerem — inżynier patrzy na maszynę,
// nie dotyka telefonu, a ekran gaśnie i traci wątek/timer z oczu.
//
// System zwalnia lock, gdy karta znika z widoku (przełączenie apki, wygaszenie
// przez systemowy timeout mimo locka bywa różne per-OS) — dlatego ponawiamy
// żądanie po powrocie do widoczności. API bywa niedostępne (starsze/desktop) →
// wszystko w try/catch, brak locka po prostu nic nie robi (bez błędów w UI).
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return
    let lock = null
    let cancelled = false

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        // odmowa/niedostępne — ignorujemy, to funkcja best-effort
      }
    }
    const onVisible = () => {
      if (!cancelled && document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      try { lock?.release() } catch {}
      lock = null
    }
  }, [active])
}
