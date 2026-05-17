const MAX_W = 400
const MAX_H = 300
const QUALITY = 0.7

export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Plik nie jest obrazem'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('Błąd odczytu pliku'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Błąd ładowania obrazu'))
      img.onload = () => {
        const ratio = Math.min(MAX_W / img.width, MAX_H / img.height, 1)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
        resolve({ dataUrl, width: w, height: h, size: Math.round(dataUrl.length * 0.75) })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
