import { useEffect, useRef, useState } from 'react'

// Speech recognition is provided by the browser; on Chrome/Safari it routes audio
// to the vendor's transcription service. Returns null in unsupported browsers
// (Firefox today) so the surrounding form still works without the mic.
const SUPPORTED =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

// Drop-in mic button. Appends finalized transcript chunks to `value` via the
// standard React onChange signature, so it works alongside any controlled input
// or textarea without changing the parent's setter shape.
export function MicButton({ value = '', onChange, lang = 'pl-PL', size = 'sm' }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const valueRef = useRef(value)

  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => () => { try { recRef.current?.stop() } catch {} }, [])

  const start = () => {
    if (!SUPPORTED) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e) => {
      let finalTxt = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalTxt += r[0].transcript
      }
      if (finalTxt) {
        const cur = valueRef.current || ''
        const sep = cur && !/[\s\n]$/.test(cur) ? ' ' : ''
        onChange?.({ target: { value: cur + sep + finalTxt.trim() } })
      }
    }
    rec.onend = () => setListening(false)
    rec.onerror = (e) => {
      setListening(false)
      // No-speech and aborted are normal stop reasons; only warn for real errors.
      if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('SpeechRecognition error', e.error)
      }
    }

    try {
      rec.start()
      recRef.current = rec
      setListening(true)
    } catch (err) {
      console.warn('SpeechRecognition start failed', err)
    }
  }

  const stop = () => {
    try { recRef.current?.stop() } catch {}
    setListening(false)
  }

  if (!SUPPORTED) return null

  const sizeCls = size === 'md' ? 'w-10 h-10 text-base' : 'w-9 h-9 text-sm'

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      className={
        'inline-flex items-center justify-center rounded-full transition select-none active:scale-95 ' +
        'focus:outline-none focus:ring-2 focus:ring-offset-1 shadow-sm ' +
        sizeCls + ' ' +
        (listening
          ? 'bg-red-600 text-white animate-pulse focus:ring-red-500/40'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-400/40')
      }
      aria-label={listening ? 'Zatrzymaj nagrywanie' : 'Dyktuj (polski)'}
      title={listening ? 'Zatrzymaj nagrywanie' : 'Dyktuj (pl-PL)'}
    >
      🎤
    </button>
  )
}

// Textarea with a floating mic button in the top-right corner. Drop-in for plain
// `<textarea className="field-textarea" ...>` — same props apply, extra right
// padding is added so dictated text doesn't run under the button.
export function MicTextarea({ value, onChange, className = '', ...rest }) {
  return (
    <div className="relative">
      <textarea
        value={value || ''}
        onChange={onChange}
        className={`field-textarea pr-12 ${className}`}
        {...rest}
      />
      {SUPPORTED && (
        <div className="absolute top-2 right-2 z-10">
          <MicButton value={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
