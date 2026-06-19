import { useEffect, useRef, useState } from 'react'
// Statyczny `?url` (zamiast dynamicznego) — Vite poprawnie EMITUJE pełny plik
// workera jako asset i daje jego URL. Sam plik (~1 MB) pobiera się dopiero gdy
// pdf.js tworzy workera (przy otwarciu podglądu), nie przy starcie apki.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

// Podgląd wygenerowanego PDF WEWNĄTRZ aplikacji — renderuje strony na <canvas>
// przez pdf.js. Canvas działa wszędzie (też iOS, gdzie <iframe>/<embed> z PDF
// bywa pusty). pdf.js + worker ładowane LENIWIE (dynamiczny import) — nie
// obciążają startu apki. Strony renderowane są na żądanie (IntersectionObserver),
// więc pamięć na telefonie nie rośnie liniowo z liczbą stron przy długim raporcie.
export default function PdfPreview({ blob, filename, canShare, onShare, onDownload, onClose }) {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [pageCount, setPageCount] = useState(0)
  const scrollRef = useRef(null)   // element przewijany = root IntersectionObservera
  const pagesRef = useRef(null)    // tu DOM-owo dokładamy wrappery stron (poza Reactem)

  useEffect(() => {
    let cancelled = false
    let pdfDoc = null
    const observers = []

    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

        const data = await blob.arrayBuffer()
        if (cancelled) return
        pdfDoc = await pdfjsLib.getDocument({ data }).promise
        if (cancelled) return

        setPageCount(pdfDoc.numPages)
        setStatus('ready')

        const host = pagesRef.current
        const root = scrollRef.current
        if (!host || !root) return
        host.innerHTML = ''
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const targetW = Math.min(host.clientWidth || 760, 1000)

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) return
          const page = await pdfDoc.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const cssScale = targetW / base.width

          // Wrapper z właściwymi proporcjami — rezerwuje miejsce zanim się wyrenderuje.
          const wrapper = document.createElement('div')
          wrapper.style.width = '100%'
          wrapper.style.aspectRatio = `${base.width} / ${base.height}`
          wrapper.className = 'mb-3 bg-white rounded shadow-md overflow-hidden'
          host.appendChild(wrapper)

          let rendered = false
          const io = new IntersectionObserver((entries) => {
            if (cancelled || rendered) return
            if (!entries.some((e) => e.isIntersecting)) return
            rendered = true
            io.disconnect()
            const canvas = document.createElement('canvas')
            const vp = page.getViewport({ scale: cssScale * dpr })
            canvas.width = Math.round(vp.width)
            canvas.height = Math.round(vp.height)
            canvas.style.width = '100%'
            canvas.style.height = '100%'
            canvas.style.display = 'block'
            wrapper.appendChild(canvas)
            page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise.catch(() => {})
          }, { root, rootMargin: '400px 0px' })
          io.observe(wrapper)
          observers.push(io)
        }
      } catch (e) {
        console.error('PdfPreview render failed', e)
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      observers.forEach((o) => o.disconnect())
      try { pdfDoc?.destroy?.() } catch { /* ignore */ }
    }
  }, [blob])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70">
      <header className="flex items-center justify-between gap-2 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-sure-dark dark:text-gray-100">Podgląd raportu</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {filename}{pageCount ? ` · ${pageCount} ${pageCount === 1 ? 'strona' : 'stron'}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canShare
            ? <button onClick={onShare} className="btn-sm bg-sure-blue text-white hover:bg-blue-700">📲 Udostępnij</button>
            : <button onClick={onDownload} className="btn-sm bg-sure-blue text-white hover:bg-blue-700">📄 Pobierz</button>}
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-300 hover:text-sure-dark dark:hover:text-white w-9 h-9 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-lg leading-none"
            aria-label="Zamknij podgląd"
          >
            ✕
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-200 dark:bg-gray-900">
        {status === 'loading' && (
          <div className="py-16 text-center text-gray-500 dark:text-gray-400">
            <div className="w-10 h-10 mx-auto mb-3 border-4 border-sure-blue/30 border-t-sure-blue rounded-full animate-spin" />
            Ładowanie podglądu…
          </div>
        )}
        {status === 'error' && (
          <div className="py-16 px-6 text-center text-red-600 dark:text-red-400">
            Nie udało się wczytać podglądu. Spróbuj pobrać PDF.
          </div>
        )}
        <div ref={pagesRef} className="p-3 sm:p-4 max-w-3xl mx-auto" />
      </div>
    </div>
  )
}
