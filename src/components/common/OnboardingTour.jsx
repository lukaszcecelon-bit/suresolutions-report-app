import { useEffect, useRef, useState } from 'react'

// Multi-step intro modal pokazywany przy pierwszym uruchomieniu.
// Klucz v2 (osobny od starej v1 inline-card na Home), żeby istniejący
// użytkownicy dostali świeży tour zamiast nic.
const STORAGE_KEY = 'suresolutions.onboarding.v2.dismissed'

const STEPS = [
  {
    icon: '👋',
    title: 'Witaj w Raporty SURE',
    body: 'Aplikacja do raportów serwisowych, uruchomień, testów prototypu i odbiorów SAT/FAT. Działa offline, instalujesz na telefonie jak natywną apkę.',
  },
  {
    icon: '📋',
    title: 'Cztery typy raportów',
    body: 'Kliknij „+ Nowy raport" i wybierz typ — od live-loggera zatrzymań maszyny po listę testów odbiorowych. Każdy ma własny scenariusz dopasowany do branży.',
  },
  {
    icon: '📷',
    title: 'Foto z adnotacjami',
    body: 'Dodaj zdjęcie aparatem telefonu. Tap w miniaturę → narysuj strzałkę, kółko, dopisz uwagę. Adnotacje przesuwasz i zmieniasz rozmiar po fakcie.',
  },
  {
    icon: '🎤',
    title: 'Dyktowanie głosem',
    body: 'W każdym dłuższym polu (uwagi, wnioski, opis czynności) jest przycisk 🎤. Wciskasz, mówisz po polsku — appka wpisze za Ciebie.',
  },
  {
    icon: '🌗',
    title: 'Tryb ciemny i instalacja',
    body: 'Przełącznik ☀️/🌙 w prawym górnym rogu. Żeby zainstalować jako appkę — Safari/Chrome → menu → „Dodaj do ekranu głównego". Działa wtedy offline jak natywna.',
  },
]

export default function OnboardingTour() {
  const [show, setShow] = useState(false)
  const [step, setStep] = useState(0)
  const touchStart = useRef(null)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') setShow(true)
    } catch {}
  }, [])

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setShow(false)
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1)
    else dismiss()
  }

  const prev = () => {
    if (step > 0) setStep(step - 1)
  }

  // Swipe handlers — przesunięcie w bok zmienia slajd (jak w karuzeli iOS).
  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchStart.current === null) return
    const delta = e.changedTouches[0].clientX - touchStart.current
    if (Math.abs(delta) > 50) {
      if (delta < 0) next()
      else prev()
    }
    touchStart.current = null
  }

  if (!show) return null

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 fade-in"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={dismiss}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-3 py-1 rounded"
          >
            Pomiń
          </button>
        </div>

        <div className="text-center py-2">
          <div className="text-6xl mb-3 leading-none">{s.icon}</div>
          <h2 className="text-xl font-bold text-sure-dark dark:text-gray-100 mb-2">{s.title}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{s.body}</p>
        </div>

        {/* Dots indicator */}
        <div className="flex justify-center gap-1.5 mt-6 mb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={
                'h-2 rounded-full transition-all ' +
                (i === step ? 'w-6 bg-sure-blue' : 'w-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500')
              }
              aria-label={`Krok ${i + 1}`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <button onClick={prev} className="btn-secondary flex-1">
              ← Wstecz
            </button>
          )}
          <button onClick={next} className="btn-primary flex-1">
            {isLast ? 'Zaczynamy!' : 'Dalej →'}
          </button>
        </div>
      </div>
    </div>
  )
}
