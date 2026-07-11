// Wspólny rdzeń generowania PDF — NATYWNY tekst (jsPDF + jspdf-autotable +
// osadzony font Roboto). Tekst w PDF jest PRAWDZIWYM tekstem: kopiowalny,
// przeszukiwalny (Ctrl+F, też po polsku), wektorowo ostry przy każdym zoomie,
// a pliki są wielokrotnie mniejsze. Wcześniej cały raport był jednym obrazem
// (html2canvas → JPEG) — stąd brak możliwości zaznaczenia/kopiowania tekstu.
//
// jspdf, jspdf-autotable i fonty (base64) są CIĘŻKIE — ładowane leniwie,
// dopiero przy realnym "Pobierz paczkę". warmupLibs() pre-fetchuje w tle.
import logoUrl from '../../assets/logo.png'
import { getImages, getVideos, getOriginals, getMediums, putMedium } from '../imageStore.js'

export { logoUrl }

export async function warmupLibs() {
  await Promise.all([
    import('jspdf').catch(() => {}),
    import('jspdf-autotable').catch(() => {}),
    import('jszip').catch(() => {}),
    import('./fonts/roboto-regular.js').catch(() => {}),
    import('./fonts/roboto-bold.js').catch(() => {}),
  ])
}

// ============================== PALETA (z dawnego CSS) ==============================
const BLUE = [61, 112, 178]    // #3D70B2
const WHITE = [255, 255, 255]
const INK = [31, 41, 55]       // #1F2937
const MUT = [107, 114, 128]    // #6B7280
const ZEBRA = [249, 250, 251]  // #F9FAFB
const BORDER = [229, 231, 235] // #E5E7EB
const LINE_GRAY = [156, 163, 175]
const THUMB_BORDER = [209, 213, 219]

// Kolory badge'y (tło, tekst) — z dawnych klas .badge
const BADGE = {
  completed: [[209, 250, 229], [6, 95, 70]],
  warning: [[254, 243, 199], [146, 64, 14]],
  rejected: [[254, 226, 226], [153, 27, 27]],
  info: [[219, 234, 254], [30, 64, 175]],
  neutral: [[243, 244, 246], [55, 65, 81]],
}

// Miniaturki w komórkach tabel (≈120×90 px → mm)
const THUMB_W = 26, THUMB_H = 19, THUMB_GAP = 1.5
const CELL_PAD = 1.8
const BODY_FS = 8.5
const BODY_LH = 3.7 // przybliżona wysokość linii dla BODY_FS (autotable ~ fontSize*1.15)

// ============================== WARSTWA DANYCH (bez zmian merytorycznych) ==============================
export function slugify(s) {
  return (s || '')
    .replace(/[ąĄ]/g, 'a').replace(/[ćĆ]/g, 'c').replace(/[ęĘ]/g, 'e')
    .replace(/[łŁ]/g, 'l').replace(/[ńŃ]/g, 'n').replace(/[óÓ]/g, 'o')
    .replace(/[śŚ]/g, 's').replace(/[źŹżŻ]/g, 'z')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80)
}

function makeFilename(idx, ctxSlug, description, ext) {
  const num = String(idx + 1).padStart(2, '0')
  const desc = description ? '__' + slugify(description) : ''
  return `${num}_${ctxSlug || 'Media'}${desc}.${ext}`
}

function extractExt(filename) {
  if (!filename) return null
  const m = filename.match(/\.([a-zA-Z0-9]{1,5})$/)
  return m ? m[1].toLowerCase() : null
}

function extFromMime(mime) {
  if (!mime) return null
  if (/mp4|quicktime/i.test(mime)) return 'mp4'
  if (/webm/i.test(mime)) return 'webm'
  if (/3gpp/i.test(mime)) return '3gp'
  if (/ogg/i.test(mime)) return 'ogv'
  return null
}

function extFromImageBlob(blob) {
  if (!blob || !blob.type) return null
  const m = blob.type.match(/^image\/([a-z0-9.+-]+)/i)
  if (!m) return null
  const sub = m[1].toLowerCase()
  if (sub === 'jpeg') return 'jpg'
  if (sub === 'svg+xml') return 'svg'
  return sub
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    a.remove()
  }, 200)
}

// Downsample Blob (oryginał z IDB) do dataURL 1200×900 (medium-res do osadzenia
// w PDF). Zwraca {dataUrl, w, h} — wymiary potrzebne do zachowania proporcji
// przy rysowaniu miniaturek i dużych zdjęć-dowodów.
async function downsampleBlobToDataUrl(blob, maxW = 1200, maxH = 900, quality = 0.88) {
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

// Wymiary obrazka z dataURL (fallback gdy nie znamy ich z downsamplu/cache).
function decodeDims(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error('decodeDims failed'))
    img.src = dataUrl
  })
}

function collectImageItemsInPlace(value, out) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const v of value) collectImageItemsInPlace(v, out)
    return
  }
  if (value.kind === 'image') out.push(value)
  for (const k of Object.keys(value)) collectImageItemsInPlace(value[k], out)
}

// Resolver zdjęć dla PDF: ustawia m.dataUrl (medium-res) + m._w/_h (proporcje).
// Cache 'medium' w IDB (klucz=originalId) przechowuje {d,w,h}. Klonuje raport,
// żeby nie mutować stanu w localStorage.
export async function resolveReportPhotos(report) {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(report)
    : JSON.parse(JSON.stringify(report))

  const imageItems = []
  collectImageItemsInPlace(clone, imageItems)
  if (imageItems.length === 0) return clone

  const originalIds = imageItems.map((m) => m.originalId).filter(Boolean)
  const allPhotoIds = imageItems.map((m) => m.photoId).filter(Boolean)
  const [mediumsMap, originalsMap, thumbsMap] = await Promise.all([
    originalIds.length > 0 ? getMediums(originalIds) : Promise.resolve(new Map()),
    originalIds.length > 0 ? getOriginals(originalIds) : Promise.resolve(new Map()),
    allPhotoIds.length > 0 ? getImages(allPhotoIds) : Promise.resolve(new Map()),
  ])

  await Promise.all(imageItems.map(async (m) => {
    if (m.dataUrl) return
    if (m.originalId && mediumsMap.has(m.originalId)) {
      const c = mediumsMap.get(m.originalId)
      if (c && typeof c === 'object' && c.d) { m.dataUrl = c.d; m._w = c.w; m._h = c.h; return }
      if (typeof c === 'string') { m.dataUrl = c; return } // legacy cache (sam string) — wymiary dobierzemy niżej
    }
    if (m.originalId && originalsMap.has(m.originalId)) {
      try {
        const r = await downsampleBlobToDataUrl(originalsMap.get(m.originalId))
        m.dataUrl = r.dataUrl; m._w = r.w; m._h = r.h
        putMedium(m.originalId, { d: r.dataUrl, w: r.w, h: r.h }).catch(() => {})
        return
      } catch (e) {
        console.warn('downsample failed, falling back to thumbnail', e)
      }
    }
    if (m.photoId && thumbsMap.has(m.photoId)) m.dataUrl = thumbsMap.get(m.photoId)
  }))

  // Uzupełnij brakujące wymiary (fallback thumbnail / legacy cache-string)
  await Promise.all(imageItems.map(async (m) => {
    if (m.dataUrl && (!m._w || !m._h)) {
      try { const d = await decodeDims(m.dataUrl); m._w = d.w; m._h = d.h } catch { /* zostaną domyślne proporcje */ }
    }
  }))

  return clone
}

// Zbieracz mediów dla builderów. push(media, ctxLabel, ctxSlug); finalize()
// dzieli na zdjęcia/wideo i nadaje _zipFilename (numerowane, ze slugiem).
export function mediaCollector() {
  const items = []
  const push = (mediaArr, ctxLabel, ctxSlug) => {
    for (const m of (mediaArr || [])) {
      items.push({ ...m, _ctxLabel: ctxLabel, _ctxSlug: ctxSlug })
    }
  }
  const finalize = () => {
    const photos = items.filter((m) => m.kind === 'image')
    const videos = items.filter((m) => m.kind === 'video')
    photos.forEach((p, i) => { p._zipFilename = makeFilename(i, p._ctxSlug, p.description, 'jpg') })
    videos.forEach((v, i) => {
      const ext = (extractExt(v.filename) || extFromMime(v.mimeType) || 'mp4').toLowerCase()
      v._zipFilename = makeFilename(i, v._ctxSlug, v.description, ext)
    })
    return { photos, videos }
  }
  return { push, finalize }
}

// Mapa photoId → ścieżka pliku w paczce ZIP (np. zdjecia/01_xxx.jpg).
export function buildLinkMaps(photos) {
  const photoMap = new Map()
  for (const p of photos || []) {
    if (p.photoId && p._zipFilename) photoMap.set(p.photoId, p._zipFilename)
  }
  return { photoMap }
}

// Deskryptory miniaturek (do drawTable thumbs / drawThumbsRow): tekst+proporcje+link.
export function thumbDescriptors(media, photoMap) {
  return (media || []).filter((m) => m.kind === 'image' && m.dataUrl).map((m) => ({
    dataUrl: m.dataUrl, w: m._w, h: m._h,
    target: m.photoId && photoMap.get(m.photoId) ? 'zdjecia/' + photoMap.get(m.photoId) : null,
  }))
}

// Deskryptory dużych zdjęć-dowodów (reklamacja) — z podpisem.
export function evidenceDescriptors(media, photoMap) {
  return (media || []).filter((m) => m.kind === 'image' && m.dataUrl).map((m) => ({
    dataUrl: m.dataUrl, w: m._w, h: m._h, description: m.description || '',
    target: m.photoId && photoMap.get(m.photoId) ? 'zdjecia/' + photoMap.get(m.photoId) : null,
  }))
}

export function formatDurationFull(ms) {
  if (!ms || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatDurationShort(ms) {
  if (!ms || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s} s`
  return `${m} min ${s} s`
}

export function timeHHMM(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Nazwa pliku = sam numer raportu (zawiera już prefiks-projekt-datę, np.
// RPT-25-104-2026-07-10). Doklejanie daty dawało podwójną datę w nazwie —
// dlatego datę dokładamy TYLKO gdy numer jest pusty (stare/ręczne raporty).
export function fileBase(report, fallback = 'raport') {
  const num = (report.header?.reportNumber || '').replace(/[^\w\-]+/g, '_')
  if (num) return num
  return `${fallback}_${report.header?.date || 'data'}`
}

// ============================== SILNIK RENDERU (natywny jsPDF) ==============================

// Logo raz wczytane do dataURL (jsPDF.addImage potrzebuje danych, nie URL-a).
let _logoCache = null
async function getLogoDataUrl() {
  if (_logoCache) return _logoCache
  try {
    const img = new Image()
    img.src = logoUrl
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej })
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    _logoCache = { dataUrl: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
  } catch {
    _logoCache = null
  }
  return _logoCache
}

async function setupDoc() {
  const [jspdfMod, autoTableMod, regMod, boldMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./fonts/roboto-regular.js'),
    import('./fonts/roboto-bold.js'),
  ])
  const jsPDF = jspdfMod.default || jspdfMod.jsPDF
  const autoTable = autoTableMod.default || autoTableMod.autoTable
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  // Osadzenie fontu Unicode — bez tego polskie znaki (ą ć ę ł ń ó ś ż ź) wyjdą
  // zniekształcone (domyślny Helvetica = WinAnsi). Bold to osobny wariant
  // (jsPDF nie symuluje faux-bold dla fontów własnych).
  doc.addFileToVFS('Roboto-Regular.ttf', regMod.default)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', boldMod.default)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')
  doc.setTextColor(INK[0], INK[1], INK[2])
  return { doc, autoTable }
}

function makeCtx(doc, autoTable, logo) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = { t: 15, r: 15, b: 16, l: 15 }
  return {
    doc, autoTable, logo,
    pageW, pageH, margin,
    x: margin.l, y: margin.t,
    contentW: pageW - margin.l - margin.r,
    links: [],
  }
}

// Serce łamania stron dla treści NIE-tabelarycznej. Tabele łamie autotable sam.
function ensureSpace(ctx, h) {
  if (ctx.y + h > ctx.pageH - ctx.margin.b) {
    ctx.doc.addPage()
    ctx.y = ctx.margin.t
    return true
  }
  return false
}

function setFill(doc, c) { doc.setFillColor(c[0], c[1], c[2]) }
function setDraw(doc, c) { doc.setDrawColor(c[0], c[1], c[2]) }
function setInk(doc, c) { doc.setTextColor(c[0], c[1], c[2]) }

function fitBox(w, h, maxW, maxH) {
  if (!w || !h) { w = 4; h = 3 } // domyślne proporcje 4:3 gdy brak wymiarów
  const r = Math.min(maxW / w, maxH / h)
  return [w * r, h * r]
}

// Badge (pill) w danym punkcie. vCenter=true → y to środek pionowy (komórki tabeli).
function drawBadgeAt(doc, x, y, text, kind, vCenter = false, big = false) {
  const [bg, fg] = BADGE[kind] || BADGE.neutral
  const fs = big ? 11 : 7.5
  const h = big ? 7 : 4.8
  doc.setFont('Roboto', 'bold'); doc.setFontSize(fs)
  const tw = doc.getTextWidth(text)
  const padX = big ? 3.5 : 1.8
  const w = tw + 2 * padX
  const top = vCenter ? y - h / 2 : y
  setFill(doc, bg)
  doc.roundedRect(x, top, w, h, 1.2, 1.2, 'F')
  setInk(doc, fg)
  doc.text(text, x + padX, top + h / 2, { baseline: 'middle' })
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
  return w
}

export function drawBadge(ctx, text, kind, big = false) {
  ensureSpace(ctx, (big ? 8 : 6) + 1)
  drawBadgeAt(ctx.doc, ctx.margin.l, ctx.y, text, kind, false, big)
  ctx.y += (big ? 8 : 6) + 1
}

export function drawReportHeader(ctx, { title, number, subtitle }) {
  const { doc, margin, contentW } = ctx
  const top = ctx.y
  const logoH = 14
  if (ctx.logo) {
    const lw = logoH * (ctx.logo.w / ctx.logo.h)
    try { doc.addImage(ctx.logo.dataUrl, 'PNG', margin.l, top, lw, logoH) } catch { /* ignore */ }
  }
  const rx = margin.l + contentW
  doc.setFont('Roboto', 'bold'); doc.setFontSize(10.5); setInk(doc, BLUE)
  const titleStr = (title || '').toUpperCase() + (subtitle ? ' · ' + subtitle : '')
  const tlines = doc.splitTextToSize(titleStr, contentW - 42)
  let ty = top + 3.5
  tlines.forEach((l) => { doc.text(l, rx, ty, { align: 'right' }); ty += 4.6 })
  doc.setFont('Roboto', 'bold'); doc.setFontSize(12); setInk(doc, INK)
  doc.text('Nr: ' + (number || '—'), rx, ty + 1.2, { align: 'right' })
  const baseY = Math.max(top + logoH, ty + 3) + 2
  setDraw(doc, BLUE); doc.setLineWidth(0.8)
  doc.line(margin.l, baseY, margin.l + contentW, baseY)
  ctx.y = baseY + 5
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
}

// Meta-tabela klucz:wartość. rows = [[{label,value|badge,colspan?}], ...].
export function drawMetaTable(ctx, rows) {
  const { doc, margin, contentW } = ctx
  const padX = 3, padY = 2.2, labelH = 3, lineH = 4.2, valFS = 9, labelFS = 7
  const rowMeta = rows.map((cells) => {
    const totalSpan = cells.reduce((s, c) => s + (c.colspan || 1), 0)
    let maxH = 0
    const cellInfo = cells.map((c) => {
      const w = contentW * ((c.colspan || 1) / totalSpan)
      let vlines = []
      if (!c.badge) {
        doc.setFont('Roboto', 'normal'); doc.setFontSize(valFS)
        vlines = doc.splitTextToSize(String(c.value ?? '—') || '—', w - 2 * padX)
      }
      const h = padY + labelH + (c.badge ? 6 : vlines.length * lineH) + padY
      if (h > maxH) maxH = h
      return { c, w, vlines }
    })
    return { cellInfo, h: maxH }
  })
  const totalH = rowMeta.reduce((s, r) => s + r.h, 0)
  ensureSpace(ctx, totalH)
  const x0 = margin.l, y0 = ctx.y
  setFill(doc, ZEBRA); doc.rect(x0, y0, contentW, totalH, 'F')
  setDraw(doc, BORDER); doc.setLineWidth(0.1); doc.rect(x0, y0, contentW, totalH)
  let y = y0
  rowMeta.forEach((rm, ri) => {
    if (ri > 0) { setDraw(doc, BORDER); doc.line(x0, y, x0 + contentW, y) }
    let x = x0
    rm.cellInfo.forEach((ci) => {
      doc.setFont('Roboto', 'bold'); doc.setFontSize(labelFS); setInk(doc, MUT)
      doc.text((ci.c.label || '').toUpperCase(), x + padX, y + padY + 2)
      if (ci.c.badge) {
        drawBadgeAt(doc, x + padX, y + padY + labelH + 3, ci.c.badge.text, ci.c.badge.kind)
      } else {
        doc.setFont('Roboto', 'normal'); doc.setFontSize(valFS); setInk(doc, INK)
        let vy = y + padY + labelH + 3
        ci.vlines.forEach((l) => { doc.text(l, x + padX, vy); vy += lineH })
      }
      x += ci.w
    })
    y += rm.h
  })
  ctx.y = y0 + totalH + 4
  doc.setFont('Roboto', 'normal'); setInk(doc, INK)
}

// Nagłówek sekcji (niebieski + linia). keep-with-next: rezerwuje miejsce na
// nagłówek + kawałek treści, żeby nie zostawić samego nagłówka na końcu strony.
export function drawSectionHeader(ctx, text, keepH = 16) {
  ensureSpace(ctx, 9 + keepH)
  const { doc, margin, contentW } = ctx
  ctx.y += 2
  doc.setFont('Roboto', 'bold'); doc.setFontSize(10.5); setInk(doc, BLUE)
  doc.text((text || '').toUpperCase(), margin.l, ctx.y + 3.5)
  const lineY = ctx.y + 5.5
  setDraw(doc, BLUE); doc.setLineWidth(0.5)
  doc.line(margin.l, lineY, margin.l + contentW, lineY)
  ctx.y = lineY + 4
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
}

// Mała etykieta (np. "Strona klienta" nad tabelą uczestników SAT/FAT).
export function drawSubLabel(ctx, text) {
  const { doc, margin } = ctx
  ensureSpace(ctx, 6)
  doc.setFont('Roboto', 'bold'); doc.setFontSize(8); setInk(doc, MUT)
  doc.text(text, margin.l, ctx.y + 3.5)
  ctx.y += 6
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
}

export function drawStatCards(ctx, cards) {
  const { doc, margin, contentW } = ctx
  const gap = 3, n = cards.length
  const cw = (contentW - (n - 1) * gap) / n, ch = 15
  ensureSpace(ctx, ch + 2)
  const y0 = ctx.y
  cards.forEach((c, i) => {
    const x = margin.l + i * (cw + gap)
    setFill(doc, ZEBRA); doc.rect(x, y0, cw, ch, 'F')
    setFill(doc, BLUE); doc.rect(x, y0, 1.2, ch, 'F')
    doc.setFont('Roboto', 'bold'); doc.setFontSize(6.5); setInk(doc, MUT)
    doc.text(doc.splitTextToSize((c.label || '').toUpperCase(), cw - 5), x + 3.5, y0 + 4)
    doc.setFont('Roboto', 'bold'); doc.setFontSize(14); setInk(doc, INK)
    doc.text(String(c.value ?? '—'), x + 3.5, y0 + ch - 3.5)
  })
  ctx.y = y0 + ch + 4
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
}

// Tabela przez jspdf-autotable z brandingiem SureSolutions.
// opts: { columns:[{header,dataKey,width?,align?}], rows:[obj],
//   thumbsCol?, thumbsKey? (pole z deskryptorami), badge?:{col,resolve(raw)->{text,kind}},
//   cellLinks?:{col,resolve(raw)->target} }
export function drawTable(ctx, opts) {
  const { doc } = ctx
  const cols = opts.columns.map((c) => ({ header: c.header, dataKey: c.dataKey }))
  const columnStyles = {}
  const widthByKey = {}
  opts.columns.forEach((c) => {
    columnStyles[c.dataKey] = {}
    if (c.width) { columnStyles[c.dataKey].cellWidth = c.width; widthByKey[c.dataKey] = c.width }
    if (c.align) columnStyles[c.dataKey].halign = c.align
  })

  const thumbBlockRows = (n, cellW) => {
    const perRow = Math.max(1, Math.floor((cellW - 2 * CELL_PAD) / (THUMB_W + THUMB_GAP)))
    return { perRow, gridRows: Math.ceil(n / perRow) }
  }

  ctx.autoTable(doc, {
    startY: ctx.y,
    margin: { left: ctx.margin.l, right: ctx.margin.r },
    theme: 'grid',
    columns: cols,
    body: opts.rows,
    columnStyles,
    styles: {
      font: 'Roboto', fontStyle: 'normal', fontSize: BODY_FS,
      textColor: INK, lineColor: BORDER, lineWidth: 0.1,
      cellPadding: CELL_PAD, valign: 'top', overflow: 'linebreak',
    },
    headStyles: { font: 'Roboto', fontStyle: 'bold', fillColor: BLUE, textColor: WHITE, fontSize: 8 },
    alternateRowStyles: { fillColor: ZEBRA },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const key = data.column.dataKey
      if (opts.badge && key === opts.badge.col) {
        data.cell.text = []
        data.cell.styles.minCellHeight = Math.max(data.cell.styles.minCellHeight || 0, 7)
      }
      if (opts.thumbsKey && key === opts.thumbsCol) {
        const thumbs = data.row.raw?.[opts.thumbsKey]
        if (thumbs && thumbs.length) {
          // Stała szerokość kolumny miniaturek pozwala policzyć układ + rzetelnie
          // zarezerwować wysokość = (wysokość tekstu) + (blok miniaturek).
          const cellW = widthByKey[key] || 50
          const { gridRows } = thumbBlockRows(thumbs.length, cellW)
          const blockH = gridRows * (THUMB_H + THUMB_GAP) + 1
          doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS)
          const txt = String(data.row.raw?.[key] ?? '')
          const tlines = txt ? doc.splitTextToSize(txt, cellW - 2 * CELL_PAD) : []
          const textH = tlines.length * BODY_LH + 2 * CELL_PAD
          data.cell.styles.minCellHeight = Math.max(data.cell.styles.minCellHeight || 0, textH + blockH)
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return
      const key = data.column.dataKey
      const raw = data.row.raw
      if (opts.badge && key === opts.badge.col) {
        const b = opts.badge.resolve(raw)
        if (b) drawBadgeAt(doc, data.cell.x + CELL_PAD, data.cell.y + data.cell.height / 2, b.text, b.kind, true)
      }
      if (opts.cellLinks && key === opts.cellLinks.col) {
        const target = opts.cellLinks.resolve(raw)
        if (target) ctx.links.push({ page: doc.getNumberOfPages(), x: data.cell.x, y: data.cell.y, w: data.cell.width, h: data.cell.height, target })
      }
      if (opts.thumbsKey && key === opts.thumbsCol) {
        const thumbs = raw?.[opts.thumbsKey]
        if (thumbs && thumbs.length) {
          const cellW = data.cell.width
          const { perRow, gridRows } = thumbBlockRows(thumbs.length, cellW)
          const blockH = gridRows * THUMB_H + (gridRows - 1) * THUMB_GAP
          const baseY = data.cell.y + data.cell.height - CELL_PAD - blockH
          thumbs.forEach((t, i) => {
            const cI = i % perRow, rI = Math.floor(i / perRow)
            const x = data.cell.x + CELL_PAD + cI * (THUMB_W + THUMB_GAP)
            const y = baseY + rI * (THUMB_H + THUMB_GAP)
            const [dw, dh] = fitBox(t.w, t.h, THUMB_W, THUMB_H)
            try { doc.addImage(t.dataUrl, 'JPEG', x, y, dw, dh) } catch { /* ignore */ }
            setDraw(doc, THUMB_BORDER); doc.setLineWidth(0.1); doc.rect(x, y, dw, dh)
            // (bez hiperłącza do pliku w ZIP — zdjęcia w PDF nie są klikalne)
          })
        }
      }
    },
  })
  ctx.y = doc.lastAutoTable.finalY + 4
}

// Blok tekstu z tłem ZEBRA. Tło rysowane SEGMENTAMI per strona (przy łamaniu
// kolejny segment dostaje własny prostokąt — bez "wiszącego" tła za krawędzią).
export function drawTextBlock(ctx, text, { label } = {}) {
  const { doc, margin, contentW } = ctx
  const padX = 3, padY = 2.5, lineH = 4.4, fs = 9
  doc.setFont('Roboto', 'normal'); doc.setFontSize(fs)
  const hasText = text !== null && text !== undefined && String(text).trim() !== ''
  const bodyLines = doc.splitTextToSize(hasText ? String(text) : '—', contentW - 2 * padX)
  const items = []
  if (label) items.push({ text: label, bold: true })
  bodyLines.forEach((t) => items.push({ text: t }))

  ensureSpace(ctx, lineH + 2 * padY)
  let i = 0
  while (i < items.length) {
    const avail = (ctx.pageH - ctx.margin.b) - ctx.y - 2 * padY
    const fit = Math.max(1, Math.floor(avail / lineH))
    const seg = items.slice(i, i + fit)
    const segH = seg.length * lineH + 2 * padY
    setFill(doc, ZEBRA); doc.rect(margin.l, ctx.y, contentW, segH, 'F')
    setDraw(doc, BORDER); doc.setLineWidth(0.1); doc.rect(margin.l, ctx.y, contentW, segH)
    let ty = ctx.y + padY + 3
    seg.forEach((it) => {
      doc.setFont('Roboto', it.bold ? 'bold' : 'normal'); doc.setFontSize(fs)
      setInk(doc, it.bold ? MUT : INK)
      doc.text(it.text, margin.l + padX, ty)
      ty += lineH
    })
    ctx.y += segH
    i += fit
    if (i < items.length) { doc.addPage(); ctx.y = ctx.margin.t }
  }
  ctx.y += 1
  doc.setFont('Roboto', 'normal'); setInk(doc, INK)
}

// Pusty stan sekcji ("Brak wpisów.") — odpowiednik dawnej klasy .empty.
export function drawEmpty(ctx, text) {
  const { doc, margin } = ctx
  ensureSpace(ctx, 8)
  doc.setFont('Roboto', 'italic'); doc.setFontSize(9); setInk(doc, [156, 163, 175])
  // Roboto-Italic nie jest osadzony — użyj normal (jsPDF i tak nie udaje italic dla custom)
  doc.setFont('Roboto', 'normal')
  doc.text(text, margin.l, ctx.y + 4)
  ctx.y += 8
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
}

// Rząd małych klikalnych miniaturek (dokumentacja ogólna / media sekcyjne).
export function drawThumbsRow(ctx, thumbs) {
  if (!thumbs || !thumbs.length) return
  const { doc, margin, contentW } = ctx
  const maxW = 26, maxH = 18, gap = 2
  ensureSpace(ctx, maxH + 2)
  let rowTop = ctx.y
  let x = margin.l
  thumbs.forEach((t) => {
    const [dw, dh] = fitBox(t.w, t.h, maxW, maxH)
    if (x + dw > margin.l + contentW) {
      rowTop += maxH + gap
      ctx.y = rowTop
      ensureSpace(ctx, maxH + 2)
      rowTop = ctx.y
      x = margin.l
    }
    try { doc.addImage(t.dataUrl, 'JPEG', x, rowTop, dw, dh) } catch { /* ignore */ }
    setDraw(doc, THUMB_BORDER); doc.setLineWidth(0.1); doc.rect(x, rowTop, dw, dh)
    // (bez hiperłącza — zdjęcia w PDF nie są klikalne)
    x += dw + gap
  })
  ctx.y = rowTop + maxH + 3
}

// Czerwony baner "BLOKUJE MONTAŻ" (reklamacja).
export function drawBlockerBanner(ctx, text) {
  const { doc, margin, contentW } = ctx
  doc.setFont('Roboto', 'bold'); doc.setFontSize(11)
  const lines = doc.splitTextToSize(text, contentW - 8)
  const h = lines.length * 5 + 6
  ensureSpace(ctx, h + 2)
  setFill(doc, [254, 226, 226]); doc.rect(margin.l, ctx.y, contentW, h, 'F')
  setDraw(doc, [220, 38, 38]); doc.setLineWidth(0.5); doc.rect(margin.l, ctx.y, contentW, h)
  setInk(doc, [153, 27, 27])
  let ty = ctx.y + 5
  lines.forEach((l) => { doc.text(l, margin.l + contentW / 2, ty, { align: 'center' }); ty += 5 })
  ctx.y += h + 3
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
}

// Duże zdjęcia-dowody (reklamacja) — contain, z podpisem.
export function drawEvidencePhotos(ctx, photos) {
  if (!photos || !photos.length) return
  const { doc, margin, contentW } = ctx
  photos.forEach((p) => {
    const [dw, dh] = fitBox(p.w, p.h, contentW, 150)
    const capH = p.description ? 5 : 0
    ensureSpace(ctx, dh + capH + 4)
    const x = margin.l + (contentW - dw) / 2
    try { doc.addImage(p.dataUrl, 'JPEG', x, ctx.y, dw, dh) } catch { /* ignore */ }
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.rect(x, ctx.y, dw, dh)
    // (bez hiperłącza — zdjęcia w PDF nie są klikalne)
    ctx.y += dh
    if (p.description) {
      doc.setFont('Roboto', 'normal'); doc.setFontSize(7.5); setInk(doc, MUT)
      doc.text(doc.splitTextToSize(p.description, contentW), x, ctx.y + 3.5)
      ctx.y += capH
    }
    ctx.y += 4
  })
  setInk(doc, INK)
}

// Załącznik fotograficzny: WSZYSTKIE zdjęcia raportu DUŻE (≈ pół strony A4 każde,
// ~2 na stronę), proporcje zachowane (contain — bez zniekształcenia), z podpisem
// (kontekst sekcji + opis) i klikalnym linkiem do pełnego pliku w paczce ZIP.
// Dzięki temu odbiorca PDF widzi zdjęcia bez rozpakowywania paczki.
// `photos` to płaska lista z mediaCollector().finalize() (ma _ctxLabel/_zipFilename).
export function drawPhotoAppendix(ctx, photos, { title = 'Załącznik — wszystkie zdjęcia' } = {}) {
  const list = (photos || []).filter((p) => p.dataUrl)
  if (!list.length) return
  const { doc, margin, contentW } = ctx
  drawSectionHeader(ctx, `${title} (${list.length})`, 70)
  const CAP_LH = 3.4
  list.forEach((p, i) => {
    const [dw, dh] = fitBox(p._w, p._h, contentW, 118) // 118 mm ≈ pół strony A4
    doc.setFontSize(7.5)
    const label = `Zdjęcie ${i + 1} / ${list.length}${p._ctxLabel ? ' · ' + p._ctxLabel : ''}`
    const labelLines = doc.splitTextToSize(label, contentW)
    const descLines = p.description ? doc.splitTextToSize(p.description, contentW) : []
    const capH = (labelLines.length + descLines.length) * CAP_LH + 2
    ensureSpace(ctx, capH + dh + 5)
    let cy = ctx.y + 3
    doc.setFont('Roboto', 'bold'); doc.setFontSize(7.5); setInk(doc, MUT)
    labelLines.forEach((l) => { doc.text(l, margin.l, cy); cy += CAP_LH })
    if (descLines.length) {
      doc.setFont('Roboto', 'normal'); setInk(doc, INK)
      descLines.forEach((l) => { doc.text(l, margin.l, cy); cy += CAP_LH })
    }
    ctx.y = cy + 1.5
    const x = margin.l + (contentW - dw) / 2
    try { doc.addImage(p.dataUrl, 'JPEG', x, ctx.y, dw, dh) } catch { /* ignore */ }
    setDraw(doc, BORDER); doc.setLineWidth(0.2); doc.rect(x, ctx.y, dw, dh)
    // (bez hiperłącza — zdjęcia w PDF nie są klikalne)
    ctx.y += dh + 5
  })
  doc.setFont('Roboto', 'normal'); doc.setFontSize(BODY_FS); setInk(doc, INK)
}

// Dwa bloki podpisów (SAT/FAT). left/right = {label,name,date}.
export function drawSignatures(ctx, left, right) {
  const { doc, margin, contentW } = ctx
  const gap = 6, bw = (contentW - gap) / 2, bh = 28
  ensureSpace(ctx, bh + 2)
  const y0 = ctx.y
  ;[[margin.l, left], [margin.l + bw + gap, right]].forEach(([x, s]) => {
    setDraw(doc, THUMB_BORDER); doc.setLineWidth(0.2); doc.roundedRect(x, y0, bw, bh, 1.5, 1.5)
    doc.setFont('Roboto', 'bold'); doc.setFontSize(7); setInk(doc, MUT)
    doc.text((s.label || '').toUpperCase(), x + 4, y0 + 5)
    setDraw(doc, LINE_GRAY); doc.setLineWidth(0.2); doc.line(x + 4, y0 + bh - 9, x + bw - 4, y0 + bh - 9)
    doc.setFont('Roboto', 'bold'); doc.setFontSize(9); setInk(doc, INK)
    if (s.name) doc.text(s.name, x + 4, y0 + bh - 5)
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7); setInk(doc, MUT)
    if (s.date) doc.text(s.date, x + 4, y0 + bh - 1.5)
  })
  ctx.y = y0 + bh + 4
  doc.setFont('Roboto', 'normal'); setInk(doc, INK)
}

// Tabela wideo (wideo nie da się osadzić — listujemy klikalne nazwy plików).
export function drawVideosTable(ctx, videos) {
  if (!videos || !videos.length) return
  const { doc, margin, contentW } = ctx
  drawSectionHeader(ctx, 'Dokumentacja wideo')
  doc.setFont('Roboto', 'normal'); doc.setFontSize(7.5); setInk(doc, MUT)
  const note = doc.splitTextToSize('Pełne pliki wideo znajdziesz w paczce ZIP w folderze wideo/. Kliknij nazwę pliku, aby otworzyć wideo (po rozpakowaniu paczki na komputerze).', contentW)
  note.forEach((l) => { doc.text(l, margin.l, ctx.y + 3); ctx.y += 4 })
  ctx.y += 1
  setInk(doc, INK)
  const rows = videos.map((v, i) => ({
    nr: String(i + 1).padStart(2, '0'),
    kontekst: v._ctxLabel || '—',
    opis: v.description || '—',
    plik: v._zipFilename || v.filename || '—',
    _target: v._zipFilename ? 'wideo/' + v._zipFilename : null,
  }))
  drawTable(ctx, {
    columns: [
      { header: 'Nr', dataKey: 'nr', width: 12 },
      { header: 'Kontekst', dataKey: 'kontekst' },
      { header: 'Opis', dataKey: 'opis' },
      { header: 'Plik w paczce', dataKey: 'plik' },
    ],
    rows,
    cellLinks: { col: 'plik', resolve: (r) => r._target },
  })
}

function applyFooters(ctx) {
  const { doc } = ctx
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    const fy = ctx.pageH - ctx.margin.b + 6
    setDraw(doc, BORDER); doc.setLineWidth(0.1)
    doc.line(ctx.margin.l, fy - 3, ctx.pageW - ctx.margin.r, fy - 3)
    doc.setFont('Roboto', 'normal'); doc.setFontSize(7); setInk(doc, LINE_GRAY)
    doc.text('Wygenerowano: ' + nowStamp(), ctx.margin.l, fy)
    doc.text('Strona ' + i + ' / ' + n, ctx.pageW - ctx.margin.r, fy, { align: 'right' })
  }
}

// Linki dodawane na KONIEC: numer strony jest pewny dopiero po wszystkich
// addPage (także tych z autotable). Zbieramy je w trakcie (page=getNumberOfPages()).
function applyLinks(ctx) {
  const { doc } = ctx
  for (const l of ctx.links) {
    try { doc.setPage(l.page); doc.link(l.x, l.y, l.w, l.h, { url: l.target }) } catch { /* ignore */ }
  }
}

// Główne wejście: drawFn(ctx) rysuje raport prymitywami; my dokładamy stopki+linki.
export async function renderReportToBlob(drawFn) {
  const { doc, autoTable } = await setupDoc()
  const logo = await getLogoDataUrl()
  const ctx = makeCtx(doc, autoTable, logo)
  await drawFn(ctx)
  applyFooters(ctx)
  applyLinks(ctx)
  return doc.output('blob')
}

// Wspólny pipeline budowy raportu: klonuje + resolwuje zdjęcia (medium-res),
// zbiera media i renderuje PDF. Zwraca surowce, których caller użyje albo do
// pobrania SAMEGO PDF, albo do złożenia paczki ZIP — bez duplikowania tych
// trzech kroków w każdym module. buildPdf dostaje (ctx, r, photos, videos);
// moduły bez wideo po prostu ignorują ostatni argument.
export async function buildReportPdf(report, collectMedia, buildPdf) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectMedia(r)
  const pdfBlob = await renderReportToBlob((ctx) => buildPdf(ctx, r, photos, videos))
  return { r, photos, videos, pdfBlob }
}

// Fabryka generatorów dla typu raportu — usuwa powtarzalny, identyczny w każdym
// module boilerplate (buildXPdf / buildXPackage). Zwraca dwa buildery
// `{ blob, filename }` BEZ pobierania; useReportPage decyduje czy pobrać, czy
// udostępnić (Web Share). `collectMedia(r)` i `drawPdf(ctx,r,photos,videos)` to
// część specyficzna typu; `baseName(r)` → nazwa pliku bez rozszerzenia.
export function makeReportGenerators(collectMedia, drawPdf, baseName) {
  return {
    pdf: async (report) => {
      const { r, pdfBlob } = await buildReportPdf(report, collectMedia, drawPdf)
      return { blob: pdfBlob, filename: baseName(r) + '.pdf' }
    },
    pkg: async (report) => {
      const { r, photos, videos, pdfBlob } = await buildReportPdf(report, collectMedia, drawPdf)
      return assemblePackage(pdfBlob, photos, videos, baseName(r))
    },
  }
}

// ============================== PACZKA ZIP (bez zmian) ==============================
export async function assemblePackage(pdfBlob, photos, videos, baseName) {
  const hasMedia = photos.length > 0 || videos.length > 0
  if (!hasMedia) {
    return { blob: pdfBlob, filename: `${baseName}.pdf` }
  }
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file(`${baseName}.pdf`, pdfBlob)

  if (photos.length > 0) {
    const folder = zip.folder('zdjecia')
    const originalIds = photos.map((p) => p.originalId).filter(Boolean)
    const originalsMap = originalIds.length > 0 ? await getOriginals(originalIds) : new Map()
    let legacyCount = 0
    photos.forEach((p, i) => {
      const original = p.originalId ? originalsMap.get(p.originalId) : null
      if (original) {
        const ext = (extFromImageBlob(original) || extractExt(p.filename) || 'jpg').toLowerCase()
        const fname = makeFilename(i, p._ctxSlug, p.description, ext)
        p._zipFilename = fname
        folder.file(fname, original)
      } else if (p.dataUrl) {
        legacyCount++
        const base64 = p.dataUrl.replace(/^data:image\/[a-z]+;base64,/, '')
        folder.file(p._zipFilename, base64, { base64: true })
      }
    })
    if (legacyCount > 0) {
      folder.file(
        'UWAGA-zdjecia-skompresowane.txt',
        `Uwaga: ${legacyCount} zdjęć w tym raporcie zostało dodane przed wprowadzeniem przechowywania oryginałów ` +
        `i jest dostępnych wyłącznie w wersji skompresowanej (400×300). Dotyczy starszych raportów.\r\n`
      )
    }
  }

  if (videos.length > 0) {
    const folder = zip.folder('wideo')
    const ids = videos.map((v) => v.videoId).filter(Boolean)
    const blobMap = await getVideos(ids)
    let missing = 0
    for (const v of videos) {
      if (v.videoId && blobMap.has(v.videoId)) {
        folder.file(v._zipFilename, blobMap.get(v.videoId))
      } else {
        missing++
      }
    }
    if (missing > 0) {
      const note = `Część plików wideo (${missing}) nie była dostępna w pamięci aplikacji — sprawdź czy raport był edytowany na innym urządzeniu. Lista nazw plików znajduje się w PDF, sekcja „Dokumentacja wideo".\r\n`
      folder.file('UWAGA-brakujace-pliki.txt', note)
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  return { blob, filename: `${baseName}.zip` }
}
