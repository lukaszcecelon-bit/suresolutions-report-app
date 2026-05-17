const MAX_W = 400
const MAX_H = 300
const QUALITY = 0.7

// Accepts any Blob with image/* mime type (File extends Blob, so File works too).
// Returns a small thumbnail dataURL suitable for embedding in PDF and showing in UI.
// The original file/blob is NOT modified — caller stores it separately if needed.
export function compressImageFile(blob) {
  return new Promise((resolve, reject) => {
    if (!blob || !blob.type || !blob.type.startsWith('image/')) {
      reject(new Error('Plik nie jest obrazem'))
      return
    }
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Błąd ładowania obrazu'))
    }
    img.onload = () => {
      try {
        const ratio = Math.min(MAX_W / img.width, MAX_H / img.height, 1)
        const w = Math.round(img.width * ratio) || MAX_W
        const h = Math.round(img.height * ratio) || MAX_H
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
        resolve({ dataUrl, width: w, height: h, size: Math.round(dataUrl.length * 0.75) })
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.src = url
  })
}

// Backwards-compat alias with a clearer name for new callsites.
export const compressImageBlob = compressImageFile
