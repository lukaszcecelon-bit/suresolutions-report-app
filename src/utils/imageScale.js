// Skalowanie obrazów — jedno źródło dla PDF-a i paczek synchronizacyjnych.
//
// Do v1.5 downsample siedział prywatnie w pdf/core.js. Paczka „Przenieś na inne
// urządzenie" też go potrzebuje (v1.6 pakuje zdjęcia w rozdzielczości raportu,
// nie w pełnej), a syncPackage.js nie może importować pdf/core.js — ściągnąłby
// jsPDF z fontami do bundla importu/eksportu.

// Downsample Bloba (oryginał z IDB) do dataURL 1200×900. Zwraca {dataUrl, w, h}
// — wymiary potrzebne do zachowania proporcji przy rysowaniu w PDF.
export async function downsampleBlobToDataUrl(blob, maxW = 1200, maxH = 900, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      try {
        let w = img.naturalWidth
        let h = img.naturalHeight
        const ratio = Math.min(maxW / w, maxH / h, 1)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx2 = canvas.getContext('2d')
        ctx2.imageSmoothingEnabled = true
        ctx2.imageSmoothingQuality = 'high'
        ctx2.drawImage(img, 0, 0, w, h)
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), w, h })
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('downsample: image load failed'))
    }
    img.src = url
  })
}

// dataURL → Blob bez pośredniego stringa base64 w pamięci ZIP-a. Zwraca null
// dla wejścia, które nie jest dataURL-em.
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl || '')
  if (!m) return null
  const mime = m[1] || 'application/octet-stream'
  if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: mime })
  const bin = atob(m[3])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
