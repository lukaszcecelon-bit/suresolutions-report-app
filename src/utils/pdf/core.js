// Wspólny rdzeń generowania PDF/paczek — infrastruktura niezależna od typu
// raportu. Buildery per typ (commissioning/service/prototype/satfat/complaint)
// żyją w osobnych plikach obok i importują stąd. Publiczne API aplikacji
// pozostaje w ../pdfGenerator.js (barrel re-export).
//
// jspdf, html2canvas i jszip są CIĘŻKIE (~700KB łącznie) — ładowane leniwie,
// dopiero przy realnym "Pobierz paczkę". `warmupLibs()` z idle-handlera
// pre-fetchuje je w tle, żeby pierwszy klik nie płacił kosztu sieci.
import logoUrl from '../../assets/logo.png'
import { getImages, getVideos, getOriginals, getMediums, putMedium } from '../imageStore.js'

export { logoUrl }

export async function warmupLibs() {
  await Promise.all([
    import('jspdf').catch(() => {}),
    import('html2canvas').catch(() => {}),
    import('jszip').catch(() => {}),
  ])
}

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

// Downsample Blob (oryginał z IDB) do dataURL o limitowanych wymiarach.
// Używane dla PDF embed — pełne oryginały (3000×4000+ z telefonu) są za duże,
// a thumbnaile (400×300) za małe przy scale 3 (pikselacja). Medium-res
// (1200×900 jpeg 0.88) to optymalny kompromis: ostre na A4 print, plik PDF
// rośnie umiarkowanie. Każde zdjęcie ~150-250 KB embedded vs ~2-5 MB original.
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
        const ctx = canvas.getContext('2d')
        // imageSmoothingQuality 'high' daje znacznie lepszy downsampling
        // (Lanczos-like) vs domyślny bilinear — istotne przy zmianie 3000→1200.
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
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

// In-place collector — zbiera wszystkie itemy {kind: 'image'} z drzewa raportu.
// Każdy item zostaje referencyjnie ten sam, więc można na nim potem mutować
// `dataUrl` i zmiana propaguje się do całej struktury.
function collectImageItemsInPlace(value, out) {
  if (value === null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const v of value) collectImageItemsInPlace(v, out)
    return
  }
  if (value.kind === 'image') out.push(value)
  for (const k of Object.keys(value)) collectImageItemsInPlace(value[k], out)
}

// Resolver zdjęć dla PDF embed. Strategia:
//  1. Najpierw spróbuj użyć ORYGINAŁU (z IDB STORE_ORIGINALS) downsamplowanego
//     do medium-res 1200×900 — daje ostry render na A4 z scale 3.
//  2. Fallback do THUMBNAIL (400×300 z STORE_IMAGES) dla starszych raportów
//     które nie mają zapisanego oryginału (legacy przed v0.6).
//
// Klonuje raport, żeby nie mutować oryginalnego stanu w localStorage.
// Mutacja `dataUrl` per-item w sklonowanym drzewie.
export async function resolveReportPhotos(report) {
  // structuredClone() jest natywne i 2-3× szybsze niż JSON.parse(JSON.stringify())
  // dla typowych raportów. Dla mediów (Blob/File) nie używamy go bezpośrednio —
  // tu klonujemy tylko strukturę raportu (zwykły JSON), więc OK.
  const clone = typeof structuredClone === 'function'
    ? structuredClone(report)
    : JSON.parse(JSON.stringify(report))

  const imageItems = []
  collectImageItemsInPlace(clone, imageItems)
  if (imageItems.length === 0) return clone

  // 1. PARALLEL FETCH z IDB — cache medium-res, oryginały i thumbnaile naraz.
  const originalIds = imageItems.map((m) => m.originalId).filter(Boolean)
  const allPhotoIds = imageItems.map((m) => m.photoId).filter(Boolean)
  const [mediumsMap, originalsMap, thumbsMap] = await Promise.all([
    // Cache 1200×900 z poprzednich generowań — hit pomija najdroższy etap
    // (dekodowanie pełnego oryginału + downsample, 200-400 ms/zdjęcie).
    originalIds.length > 0 ? getMediums(originalIds) : Promise.resolve(new Map()),
    originalIds.length > 0 ? getOriginals(originalIds) : Promise.resolve(new Map()),
    // Bierzemy WSZYSTKIE thumbnaile od razu — i tak będą fallback gdy brak oryginału
    // lub downsample padnie.
    allPhotoIds.length > 0 ? getImages(allPhotoIds) : Promise.resolve(new Map()),
  ])

  // 2. PARALLEL DOWNSAMPLE — dla 5-15 zdjęć daje 3-5× speedup vs sekwencyjnie.
  await Promise.all(imageItems.map(async (m) => {
    if (m.dataUrl) return
    if (m.originalId && mediumsMap.has(m.originalId)) {
      m.dataUrl = mediumsMap.get(m.originalId)
      return
    }
    if (m.originalId && originalsMap.has(m.originalId)) {
      try {
        m.dataUrl = await downsampleBlobToDataUrl(originalsMap.get(m.originalId))
        // Zapis do cache w tle — nie blokuje generowania; przy kolejnej paczce
        // tego raportu zdjęcie wejdzie z cache. Inwalidacja: replaceOriginal/
        // deleteOriginals kasują wpis o tym samym kluczu.
        putMedium(m.originalId, m.dataUrl).catch(() => {})
        return
      } catch (e) {
        console.warn('downsample failed, falling back to thumbnail', e)
      }
    }
    // Fallback do thumbnaila
    if (m.photoId && thumbsMap.has(m.photoId)) {
      m.dataUrl = thumbsMap.get(m.photoId)
    }
  }))

  return clone
}

// Zbieracz mediów dla builderów per typ. Użycie:
//   const { push, finalize } = mediaCollector()
//   push(item.media, 'Czytelny kontekst', 'Slug-do-nazwy-pliku')
//   const { photos, videos } = finalize()
// finalize() dzieli itemy na zdjęcia/wideo i nadaje `_zipFilename`
// (numerowane, ze slugiem kontekstu i opisu) używane w PDF i paczce ZIP.
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
    photos.forEach((p, i) => {
      p._zipFilename = makeFilename(i, p._ctxSlug, p.description, 'jpg')
    })
    videos.forEach((v, i) => {
      const ext = (extractExt(v.filename) || extFromMime(v.mimeType) || 'mp4').toLowerCase()
      v._zipFilename = makeFilename(i, v._ctxSlug, v.description, ext)
    })
    return { photos, videos }
  }
  return { push, finalize }
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

export function esc(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Mapa photoId → względna ścieżka pliku w paczce ZIP (np. `zdjecia/01_xxx.jpg`).
// Używane przez `renderThumbs()` żeby miniaturki inline były klikalne (otwierają
// pełne zdjęcie po rozpakowaniu paczki na komputerze). Każde zdjęcie w `photos`
// ma już `_zipFilename` ustawione przez finalize() z mediaCollector().
// (Wideo nie potrzebuje mapy — `renderVideosHtml` buduje link z `_zipFilename`
// bezpośrednio.)
export function buildLinkMaps(photos) {
  const photoMap = new Map()
  for (const p of photos || []) {
    if (p.photoId && p._zipFilename) photoMap.set(p.photoId, p._zipFilename)
  }
  return { photoMap }
}

// Renderuje rząd MAŁYCH klikalnych miniaturek pod tekstem (wzór: raport
// serwisowy). Każda miniatura: zachowane proporcje (CSS max-width/height),
// klikalna do pełnego pliku w paczce ZIP. Zwraca '' gdy brak zdjęć.
export function renderThumbs(media, photoMap) {
  const photos = (media || []).filter((m) => m.kind === 'image' && m.dataUrl)
  if (photos.length === 0) return ''
  const imgs = photos.map((m) => {
    const fname = m.photoId ? photoMap.get(m.photoId) : null
    const attrs = fname ? ` data-link-target="zdjecia/${esc(fname)}"` : ''
    return `<img class="pdf-thumb" src="${m.dataUrl}"${attrs} />`
  }).join('')
  return `<div class="thumb-row">${imgs}</div>`
}

// Nagłówek sekcji + rząd miniaturek. Zwraca '' gdy brak zdjęć (np. media
// sekcyjne/ogólne których nie ma) — żeby nie renderować pustego nagłówka.
export function thumbsSection(heading, media, photoMap) {
  const html = renderThumbs(media, photoMap)
  if (!html) return ''
  return `<h2>${esc(heading)}</h2>${html}`
}

// Każdy logiczny wiersz (rozdzielony \n) trafia do osobnego <div class="text-line">.
// Dzięki temu algorytm łamania stron mierzy bounding rect KAŻDEJ linii osobno
// i jeśli granica strony wypada w środku text-bloku, cofa się DO POCZĄTKU linii,
// która by została pocięta — zamiast tnąć ją poziomo na pół.
export function textLines(s) {
  if (s === null || s === undefined || !String(s).trim()) {
    return '<div class="text-line">—</div>'
  }
  return String(s).split('\n').map((line) => {
    return `<div class="text-line">${line ? esc(line) : '&nbsp;'}</div>`
  }).join('')
}

// Komórka tekstowa + małe miniaturki pod spodem (wspólny wzorzec tabel).
export function textWithThumbs(text, media, photoMap) {
  const body = text
    ? esc(text).replace(/\n/g, '<br/>')
    : '<span class="cell-text--empty">—</span>'
  return `<div class="cell-text">${body}</div>${renderThumbs(media, photoMap)}`
}

// Tabela wideo na końcu raportu. Wideo nie da się osadzić w PDF (to nie obraz),
// więc listujemy je jako klikalne nazwy plików w paczce ZIP (folder wideo/),
// z kontekstem (do którego punktu/zatrzymania/testu należą). Zwraca '' gdy brak.
export function renderVideosHtml(allVideos) {
  if (!allVideos || allVideos.length === 0) return ''
  return `
    <h2>Dokumentacja wideo</h2>
    <p class="note">Pełne pliki wideo znajdziesz w paczce ZIP w folderze <strong>wideo/</strong>. Kliknij nazwę pliku aby otworzyć wideo (po rozpakowaniu paczki na komputerze).</p>
    <table class="stops">
      <thead>
        <tr><th style="width:36px">Nr</th><th>Kontekst</th><th>Opis</th><th>Plik w paczce</th></tr>
      </thead>
      <tbody>
        ${allVideos.map((v, i) => {
          const target = v._zipFilename ? `wideo/${v._zipFilename}` : null
          const fnameStr = esc(v._zipFilename || v.filename || '—')
          const fileCell = target
            ? `📁 <span class="media-link" data-link-target="${esc(target)}">${fnameStr}</span>`
            : `📁 ${fnameStr}`
          return `
          <tr>
            <td>${String(i + 1).padStart(2, '0')}</td>
            <td>${esc(v._ctxLabel || '—')}</td>
            <td>${esc(v.description || '—')}</td>
            <td>${fileCell}</td>
          </tr>
        `}).join('')}
      </tbody>
    </table>
  `
}

const CSS = `
  * { box-sizing: border-box; }
  .page {
    width: 794px;
    padding: 56px 56px 80px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1F2937;
    background: #fff;
    font-size: 12.5px;
    line-height: 1.55;
  }
  .hdr {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 3px solid #3D70B2; padding-bottom: 18px; margin-bottom: 22px;
  }
  .hdr-left { display: flex; align-items: center; gap: 16px; }
  .logo { height: 60px; width: auto; }
  .company { font-size: 20px; font-weight: 700; color: #1F2937; letter-spacing: -0.3px; }
  .hdr-right { text-align: right; }
  .title {
    font-size: 14px; font-weight: 700; color: #3D70B2; text-transform: uppercase;
    letter-spacing: 0.5px; line-height: 1.3;
  }
  .num {
    font-size: 16px; color: #1F2937; margin-top: 6px; font-weight: 600;
  }
  .num .lbl-inline { color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; margin-right: 4px; }

  table.meta {
    width: 100%; border-collapse: collapse; margin-bottom: 18px;
    background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px;
    overflow: hidden;
  }
  table.meta td {
    padding: 10px 14px; vertical-align: top; font-size: 12px;
    border-top: 1px solid #E5E7EB;
  }
  table.meta tr:first-child td { border-top: none; }
  .lbl {
    color: #6B7280; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600; margin-right: 4px;
  }

  h2 {
    font-size: 14px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;
    color: #3D70B2; margin: 26px 0 12px 0; padding-bottom: 6px;
    border-bottom: 2px solid #3D70B2;
  }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
  .stat {
    background: #F9FAFB; border-left: 4px solid #3D70B2; padding: 12px 14px; border-radius: 4px;
  }
  .stat-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6B7280; font-weight: 600; }
  .stat-val { font-size: 20px; font-weight: 700; color: #1F2937; margin-top: 4px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: -0.5px; }

  table.stops {
    width: 100%; border-collapse: collapse; font-size: 11.5px;
    margin-bottom: 6px;
  }
  table.stops th, table.stops td {
    border: 1px solid #E5E7EB; padding: 8px 10px; text-align: left; vertical-align: top;
  }
  table.stops th {
    background: #3D70B2; font-weight: 600; color: #fff; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.4px;
  }
  table.stops tr:nth-child(even) td { background: #F9FAFB; }

  .text-block {
    background: #F9FAFB; border: 1px solid #E5E7EB;
    padding: 12px 14px; border-radius: 4px; min-height: 44px;
    font-size: 12.5px; line-height: 1.6;
  }
  /* Każda linia text-bloku jest osobnym blokiem — slicer canvas mierzy
     ją indywidualnie i łamie strony POMIĘDZY liniami, nigdy w połowie. */
  .text-line {
    display: block;
    line-height: 1.6;
    min-height: 1em;
  }
  .empty { color: #9CA3AF; font-style: italic; padding: 8px 0; }

  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
  }
  .badge.completed { background: #D1FAE5; color: #065F46; }
  .badge.warning   { background: #FEF3C7; color: #92400E; }
  .badge.rejected  { background: #FEE2E2; color: #991B1B; }
  .badge.info      { background: #DBEAFE; color: #1E40AF; }

  .info-card {
    background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px;
    padding: 10px 14px;
  }

  /* SAT/FAT signature blocks — two side-by-side boxes with a line for hand-signing */
  .signatures {
    display: grid; grid-template-columns: 1fr 1fr; gap: 18px;
    margin-top: 10px;
  }
  .sig-box {
    border: 1px solid #D1D5DB; border-radius: 6px; padding: 16px 18px 14px;
    background: #fff; min-height: 110px;
  }
  .sig-lbl {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
    color: #6B7280; font-weight: 600; margin-bottom: 26px;
  }
  .sig-line {
    border-top: 1px solid #9CA3AF; margin-top: 8px; padding-top: 6px;
  }
  .sig-name {
    font-size: 12px; color: #1F2937; font-weight: 600; min-height: 16px;
  }
  .sig-date {
    font-size: 10px; color: #6B7280; margin-top: 2px; min-height: 12px;
  }

  .photos {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
    margin-bottom: 10px;
  }
  .photo {
    border: 1px solid #D1D5DB; border-radius: 6px; overflow: hidden; background: #fff;
  }
  .photo img {
    width: 100%; height: 220px; object-fit: cover; display: block;
    background: #F3F4F6; border-bottom: 1px solid #D1D5DB;
  }
  .photo-meta { padding: 10px 14px 12px; }
  .photo-num {
    display: inline-block; font-size: 10px; font-weight: 700; color: #fff;
    background: #3D70B2; padding: 3px 10px; border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px;
  }
  .photo-ctx { font-size: 11.5px; color: #1F2937; font-weight: 600; line-height: 1.35; }
  .photo-desc { font-size: 11px; color: #4B5563; margin-top: 4px; line-height: 1.45; }
  .photo-file {
    font-size: 9.5px; color: #6B7280; margin-top: 8px;
    padding-top: 6px; border-top: 1px dashed #E5E7EB;
    font-family: ui-monospace, monospace; word-break: break-all;
  }

  .note { font-size: 10.5px; color: #6B7280; font-style: italic; margin: 4px 0 8px; }

  /* Klikalne linki w PDF do plików w paczce ZIP (zdjęcia/wideo).
     Wygląd "tradycyjnego" linka: sure-blue underline. Działa po
     rozpakowaniu paczki na desktopie. Pozycja linka jest dodawana
     programowo w renderHtmlToBlob przez pdf.link() bo html2canvas
     rasteryzuje wszystko do pikseli i traci hyperlinki. */
  .media-link {
    color: #3D70B2; text-decoration: underline; white-space: nowrap;
  }
  .photo[data-link-target] { cursor: pointer; }

  /* Małe miniaturki POD opisem czynności/elementu/obserwacji.
     Proporcje zachowane: tylko max-width/max-height + auto → obrazek skaluje się
     w ramce zachowując oryginalny stosunek boków, bez przycinania. Klikalne
     (data-link-target) — otwierają pełne zdjęcie z paczki ZIP. */
  .thumb-row {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
  }
  .pdf-thumb {
    max-width: 120px; max-height: 90px; width: auto; height: auto;
    border: 1px solid #D1D5DB; border-radius: 4px; display: block;
    background: #F3F4F6;
  }
  /* Tekst opisu czynności/obserwacji nad miniaturkami */
  .cell-text { white-space: pre-wrap; }
  .cell-text--empty { color: #9CA3AF; }

  /* Reklamacja — czerwony baner "blokuje montaż" */
  .blocker-banner {
    background: #FEE2E2; border: 2px solid #DC2626; color: #991B1B;
    border-radius: 6px; padding: 10px 14px; margin-bottom: 16px;
    font-size: 14px; font-weight: 700; text-align: center; letter-spacing: 0.3px;
  }
  /* Reklamacja — zdjęcia-dowody: duże, proporcje zachowane (contain, bez kadrowania) */
  .evidence {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 6px;
  }
  .evidence.single { grid-template-columns: 1fr; }
  .evidence-item {
    border: 1px solid #D1D5DB; border-radius: 6px; overflow: hidden; background: #F9FAFB;
  }
  .evidence-item img {
    width: 100%; max-height: 460px; object-fit: contain; display: block; background: #fff;
  }
  .evidence-cap {
    font-size: 9.5px; color: #6B7280; padding: 6px 10px;
    border-top: 1px solid #E5E7EB; font-family: ui-monospace, monospace; word-break: break-all;
  }

  .section-block { margin-bottom: 4px; }
  .pair-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px;
    margin-bottom: 10px;
  }
  .pair-item .lbl {
    color: #6B7280; font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600; display: block; margin-bottom: 2px;
  }
  .pair-item .val { font-size: 12.5px; color: #1F2937; }

  .footer {
    margin-top: 36px; padding-top: 12px; border-top: 1px solid #E5E7EB;
    display: flex; justify-content: space-between; font-size: 10px; color: #9CA3AF;
  }
`

// Oddaj główny wątek na jedną klatkę — przeglądarka może odmalować UI
// (spinner/overlay) i obsłużyć dotyk. Wstawiane między ciężkimi etapami
// renderu PDF (każdy slice strony to JPEG-encode canvasa ~2400px szer.).
// html2canvas sam w sobie pozostaje jednym blokiem (ogranicz. biblioteki),
// ale etap cięcia stron — dotąd drugi największy — przestaje mrozić UI.
function yieldToUI() {
  return new Promise((r) => setTimeout(r, 0))
}

export async function renderHtmlToBlob(html) {
  // Dynamic imports — Vite code-splits these into separate chunks. Browser
  // caches the module after first call, so subsequent generations are instant.
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.pointerEvents = 'none'

  const style = document.createElement('style')
  style.textContent = CSS
  container.appendChild(style)

  const content = document.createElement('div')
  content.innerHTML = html
  container.appendChild(content)
  document.body.appendChild(container)

  try {
    await new Promise((r) => setTimeout(r, 50))
    const imgs = Array.from(content.querySelectorAll('img'))
    await Promise.all(imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise((r) => { img.onload = r; img.onerror = r })
    ))

    const node = content.querySelector('.page')

    // IMPORTANT: measure ALL atomic-element bounds BEFORE html2canvas, so we use
    // the exact same layout that html2canvas will render. (Doing it after has
    // caused off-by-N-px discrepancies that produced visually clipped elements.)
    // `.text-block` chroni cały kawałek przed cięciem — jeśli mieści się w jednej stronie.
    // Jeśli text-block jest za wysoki (filter `b - t <= fullPageHeightPx - 40` go wyklucza),
    // dolny poziom granularności daje `.text-line` — każda linia osobno.
    //
    // Tabele: `table` chroni całą tabelę jako jeden blok (gdy się mieści), `thead`
    // chroni sam nagłówek przed cięciem horyzontalnym, `tbody tr` per-wiersz.
    // Dla dużych tabel filter wyklucza `table`, ale thead + per-row nadal działa.
    const NO_BREAK_SELECTORS = '.photo, .evidence-item, table, thead, tbody tr, .stat, .info-card, .sig-box, .text-block, .text-line, .pdf-thumb, h2'
    const nodeRect = node.getBoundingClientRect()
    const sourceHeightPx = node.offsetHeight
    const sourceWidthPx = node.offsetWidth

    // Zbierz pozycje wszystkich klikalnych elementów (`[data-link-target]`)
    // PRZED html2canvas. Po rasteryzacji do canvas linki HTML giną — dodajemy
    // je programowo do PDF przez `pdf.link()` po wyrenderowaniu obrazu.
    const linkBoundsCss = Array.from(node.querySelectorAll('[data-link-target]'))
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          target: el.dataset.linkTarget,
          top: r.top - nodeRect.top,
          left: r.left - nodeRect.left,
          width: r.width,
          height: r.height,
        }
      })
      .filter((l) => l.target && l.width > 0 && l.height > 0)

    const noBreakBoundsPx = Array.from(node.querySelectorAll(NO_BREAK_SELECTORS))
      .map((el) => {
        const r = el.getBoundingClientRect()
        let bottom = r.bottom - nodeRect.top

        // "Keep with next" dla nagłówków sekcji h2: rozszerz ich dolną granicę
        // tak, żeby sięgała ZA początek pierwszego widocznego siblinga (treść
        // sekcji). Dzięki temu jeśli pageEnd wypadnie MIĘDZY h2 a jego treścią
        // (czyli h2 zostałby sam na poprzedniej stronie), algorytm wykryje
        // konflikt i przeniesie h2 razem z treścią na nową stronę.
        // +1px bo `bottom > pageEnd` to ostry warunek; przy bottom === pageEnd
        // (np. pageEnd właśnie ustawiony na top siblinga) nie byłby konfliktu.
        if (el.tagName === 'H2') {
          let next = el.nextElementSibling
          while (next && (next.offsetHeight === 0 || next.offsetWidth === 0)) {
            next = next.nextElementSibling
          }
          if (next) {
            const nextTopRel = next.getBoundingClientRect().top - nodeRect.top
            bottom = Math.max(bottom, nextTopRel + 1)
          }
        }

        // Analogicznie dla <thead>: rozszerz dolną granicę do top pierwszego
        // <tbody tr> w tej samej tabeli. Bez tego thead mógłby zostać sam na
        // końcu strony 1, a pierwszy wiersz danych szedłby na stronę 2 —
        // wygląda jak zerwany nagłówek tabeli.
        if (el.tagName === 'THEAD') {
          const table = el.closest('table')
          const firstBodyTr = table?.querySelector('tbody tr')
          if (firstBodyTr) {
            const nextTopRel = firstBodyTr.getBoundingClientRect().top - nodeRect.top
            bottom = Math.max(bottom, nextTopRel + 1)
          }
        }

        return [r.top - nodeRect.top, bottom]
      })

    // scale: 3 → dla source HTML 794px daje canvas 2382px → 288 DPI na A4.
    // To poziom "print quality" (vs 192 DPI z scale 2). Tekst i tabele ostre,
    // brak pikselacji nawet przy zoomie 200% w czytniku PDF. Trade-off:
    // plik PDF urośnie ~2× (np. 1.3 MB → 2.6 MB dla typowego raportu),
    // ale akceptowalne dla raportów typowo 1-5 MB do wysłania mailem.
    const canvas = await html2canvas(node, {
      scale: 3,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })
    await yieldToUI()

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width

    // Track info per rendered page — używane potem do mapowania pozycji
    // klikalnych linków (data-link-target) na konkretną stronę PDF.
    const pagesInfo = []
    const cssPerCanvasPx = sourceHeightPx / canvas.height // scale^-1

    if (imgH <= pageH) {
      // JPEG quality 0.95 — minimalizuje artefakty kompresji na krawędziach
      // tekstu i ramek tabel.
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgW, imgH)
      pagesInfo.push({ pageIndex: 0, startCssY: 0, endCssY: sourceHeightPx, yOffsetMm: 0 })
    } else {
      // Continuation pages (page 2, 3, ...) get a top margin so content doesn't
      // sit flush against the paper edge. The first page already has its CSS
      // padding baked into the source render.
      const CONTINUATION_TOP_MM = 14
      const BOTTOM_BUFFER_MM = 8
      const fullPageHeightPx = Math.floor((pageH * canvas.width) / pageW)
      const continuationOffsetPx = Math.round((CONTINUATION_TOP_MM * canvas.width) / pageW)
      const bottomBufferPx = Math.round((BOTTOM_BUFFER_MM * canvas.width) / pageW)
      const scaleY = canvas.height / sourceHeightPx

      const ranges = noBreakBoundsPx
        .map(([t, b]) => [Math.round(t * scaleY), Math.round(b * scaleY)])
        .filter(([t, b]) => b - t > 0 && b - t <= fullPageHeightPx - 40)
        .sort((a, b) => a[0] - b[0])

      let y = 0
      let isFirst = true
      while (y < canvas.height) {
        // Jedna strona na "oddech" — patrz yieldToUI().
        await yieldToUI()
        // Effective drawable area per page (reserve top margin on continuation pages
        // and a small bottom buffer so the last protected element doesn't kiss the edge)
        const topReserve = isFirst ? 0 : continuationOffsetPx
        const availPx = fullPageHeightPx - topReserve - bottomBufferPx
        let pageEnd = Math.min(y + availPx, canvas.height)

        // Pull pageEnd up so we don't slice through a protected element.
        for (let iter = 0; iter < 100; iter++) {
          let conflict = null
          for (const [top, bottom] of ranges) {
            if (top >= pageEnd) break
            if (top < pageEnd && bottom > pageEnd && top > y) {
              conflict = top
              break
            }
          }
          if (conflict === null) break
          pageEnd = conflict
        }

        // Fallback: if we couldn't fit anything (element too tall), force-fill.
        if (pageEnd <= y) pageEnd = Math.min(y + availPx, canvas.height)

        const sliceH = pageEnd - y
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = sliceH
        const ctx = slice.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, slice.width, slice.height)
        ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        const sliceImgH = (sliceH * imgW) / canvas.width
        if (!isFirst) pdf.addPage()
        const yOffsetMm = isFirst ? 0 : CONTINUATION_TOP_MM
        pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, yOffsetMm, imgW, sliceImgH)
        pagesInfo.push({
          pageIndex: pagesInfo.length,
          startCssY: y * cssPerCanvasPx,
          endCssY: pageEnd * cssPerCanvasPx,
          yOffsetMm,
        })
        isFirst = false
        y = pageEnd
      }
    }

    // === KLIKALNE LINKI W PDF ===
    // Po wszystkich addImage'ach, dodajemy linki przez pdf.link() w pozycjach
    // odpowiadających HTML-owym [data-link-target]. Każdy link otwiera plik
    // względny w paczce ZIP (np. zdjecia/01_xxx.jpg). Działa po rozpakowaniu
    // paczki na komputerze w czytnikach PDF: Adobe, Foxit, Chrome PDF, etc.
    if (linkBoundsCss.length > 0 && pagesInfo.length > 0) {
      const mmPerCssPx = pageW / sourceWidthPx
      for (const link of linkBoundsCss) {
        // Wybierz stronę zawierającą środek linku (rzadko zdarza się że link
        // przecina granicę stron — w takim wypadku trafi tam gdzie ma więcej).
        const centerCss = link.top + link.height / 2
        const page = pagesInfo.find(
          (p) => centerCss >= p.startCssY && centerCss < p.endCssY
        )
        if (!page) continue

        const yOnPageCss = link.top - page.startCssY
        const xMm = link.left * mmPerCssPx
        const yMm = yOnPageCss * mmPerCssPx + page.yOffsetMm
        const wMm = link.width * mmPerCssPx
        const hMm = link.height * mmPerCssPx

        try {
          pdf.setPage(page.pageIndex + 1) // jsPDF używa 1-indexed pages
          pdf.link(xMm, yMm, wMm, hMm, { url: link.target })
        } catch (e) {
          console.warn('pdf.link failed for', link.target, e)
        }
      }
    }

    return pdf.output('blob')
  } finally {
    document.body.removeChild(container)
  }
}

export function fileBase(report, fallback = 'raport') {
  const num = (report.header?.reportNumber || fallback).replace(/[^\w\-]+/g, '_')
  return `${num}_${report.header?.date || 'data'}`
}

export async function assemblePackage(pdfBlob, photos, videos, baseName) {
  const hasMedia = photos.length > 0 || videos.length > 0
  if (!hasMedia) {
    return { blob: pdfBlob, filename: `${baseName}.pdf` }
  }
  // Lazy-loaded — only paid for when the report actually has media.
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file(`${baseName}.pdf`, pdfBlob)

  if (photos.length > 0) {
    const folder = zip.folder('zdjecia')

    // Resolve full-resolution originals up-front. Photos uploaded before originals
    // were stored have only a thumbnail dataURL — those fall back to embedding the
    // compressed thumbnail bytes.
    const originalIds = photos.map((p) => p.originalId).filter(Boolean)
    const originalsMap = originalIds.length > 0 ? await getOriginals(originalIds) : new Map()

    let legacyCount = 0
    photos.forEach((p, i) => {
      const original = p.originalId ? originalsMap.get(p.originalId) : null
      if (original) {
        // Full-resolution path: use the blob as-is, infer extension from its MIME type.
        const ext = (extFromImageBlob(original) || extractExt(p.filename) || 'jpg').toLowerCase()
        const fname = makeFilename(i, p._ctxSlug, p.description, ext)
        p._zipFilename = fname  // keep PDF caption in sync with the actual file we packed
        folder.file(fname, original)
      } else if (p.dataUrl) {
        // Legacy fallback (no original stored — only compressed thumb in IDB).
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
