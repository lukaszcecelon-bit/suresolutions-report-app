// Eksport / import paczek synchronizacyjnych (.suresync) — format ZIP.
// Pozwala przenosić raporty między urządzeniami (np. telefon → komputer)
// bez backendu: paczka → Web Share API (AirDrop / Mail / OneDrive / ...) →
// import na drugim urządzeniu przez file picker.
//
// Dwa tryby paczki:
//   - `single-report` — jeden raport + jego media (use case sync między urządzeniami)
//   - `all-reports`   — wszystkie raporty + ich media (use case backup całej bazy)
//
// Format:
// ┌─ {nazwa}.suresync (ZIP)
// │   ├─ manifest.json           — format, version, bundleType, timestamp, stats
// │   ├─ report.json             — pojedynczy raport (single-report mode)
// │   │   ALBO
// │   ├─ reports.json            — tablica wszystkich raportów (all-reports mode)
// │   ├─ images/thumb_{id}.jpg   — kompresowane miniatury
// │   ├─ originals/orig_{id}.ext — pełnowymiarowe oryginały zdjęć
// │   └─ videos/{id}.ext         — pliki wideo

import {
  getImages, getOriginals, getVideos,
  replaceImage, replaceOriginal, replaceVideo,
} from './imageStore.js'
import { collectMediaIds, loadAll, upsert, newId } from './storage.js'
import { isPdfFile, extractPackageFromPdf } from './pdfAttachment.js'
import { slugify } from './text.js'
import { setLastBackupAt } from './settings.js'

const FORMAT = 'suresync-v1'

// ---------- Helpers ----------

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('blob read failed'))
    reader.readAsDataURL(blob)
  })
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

function extFromVideoBlob(blob) {
  if (!blob || !blob.type) return null
  if (/mp4|quicktime/i.test(blob.type)) return 'mp4'
  if (/webm/i.test(blob.type)) return 'webm'
  if (/3gpp/i.test(blob.type)) return '3gp'
  if (/ogg/i.test(blob.type)) return 'ogv'
  return 'mp4'
}

// ---------- Adding media to ZIP ----------

async function addMediaToZip(zip, mediaIds) {
  // Photos (miniatury — stored as base64 dataURL stringów w IDB)
  if (mediaIds.photos.size > 0) {
    const images = await getImages(Array.from(mediaIds.photos))
    const folder = zip.folder('images')
    for (const [id, dataUrl] of images.entries()) {
      const m = (dataUrl || '').match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i)
      if (!m) continue
      const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
      folder.file(`thumb_${id}.${ext}`, m[2], { base64: true })
    }
  }

  // Originals (pełna rozdzielczość, stored as Blob)
  if (mediaIds.originals.size > 0) {
    const originals = await getOriginals(Array.from(mediaIds.originals))
    const folder = zip.folder('originals')
    for (const [id, blob] of originals.entries()) {
      const ext = extFromImageBlob(blob) || 'jpg'
      folder.file(`orig_${id}.${ext}`, blob)
    }
  }

  // Videos (Blob)
  if (mediaIds.videos.size > 0) {
    const videos = await getVideos(Array.from(mediaIds.videos))
    const folder = zip.folder('videos')
    for (const [id, blob] of videos.entries()) {
      const ext = extFromVideoBlob(blob) || 'mp4'
      folder.file(`${id}.${ext}`, blob)
    }
  }
}

// ---------- Export single report ----------

export async function exportReportPackage(report) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const mediaIds = collectMediaIds(report)

  zip.file('manifest.json', JSON.stringify({
    format: FORMAT,
    bundleType: 'single-report',
    exportedAt: new Date().toISOString(),
    sourceUserAgent: navigator.userAgent,
    reportId: report.id,
    reportType: report.type,
    reportNumber: report.header?.reportNumber || null,
    updatedAt: report.updatedAt,
    stats: {
      photoCount: mediaIds.photos.size,
      originalCount: mediaIds.originals.size,
      videoCount: mediaIds.videos.size,
    },
  }, null, 2))

  zip.file('report.json', JSON.stringify(report))

  await addMediaToZip(zip, mediaIds)

  return await zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

// ---------- Export all reports (backup) ----------

// Bez argumentu = pełny backup (wszystkie raporty). Z argumentem = paczka
// z wybranymi raportami (multi-select na Home) — ten sam format 'all-reports',
// więc import po drugiej stronie działa identycznie.
export async function exportAllReportsPackage(reportsArg) {
  const reports = reportsArg || loadAll()
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()

  // Zbierz media ze wszystkich raportów do jednego zestawu
  const allMedia = { photos: new Set(), originals: new Set(), videos: new Set() }
  for (const r of reports) {
    const m = collectMediaIds(r)
    for (const id of m.photos) allMedia.photos.add(id)
    for (const id of m.originals) allMedia.originals.add(id)
    for (const id of m.videos) allMedia.videos.add(id)
  }

  zip.file('manifest.json', JSON.stringify({
    format: FORMAT,
    bundleType: 'all-reports',
    exportedAt: new Date().toISOString(),
    sourceUserAgent: navigator.userAgent,
    reportCount: reports.length,
    stats: {
      photoCount: allMedia.photos.size,
      originalCount: allMedia.originals.size,
      videoCount: allMedia.videos.size,
    },
  }, null, 2))

  zip.file('reports.json', JSON.stringify(reports))

  await addMediaToZip(zip, allMedia)

  return await zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

// ---------- Import — odczyt manifestu ----------

// Czyta paczkę z pliku i zwraca {zip, manifest, conflictingIds}.
// conflictingIds — lista raportów o id które już istnieją lokalnie (do
// pokazania UI conflict resolution).
export async function readPackage(inputFile) {
  // PDF na wejściu (v1.4) — wyciągamy z niego zaszytą paczkę i dalej idzie już
  // zwykła ścieżka ZIP-a. Dzięki temu wystarczy PDF, który monter i tak wysyła:
  // nie trzeba prosić go o wygenerowanie osobnego pliku.
  let file = inputFile
  if (await isPdfFile(inputFile)) {
    const extracted = await extractPackageFromPdf(inputFile)
    if (!extracted) {
      throw new Error(
        'Ten PDF nie zawiera danych raportu. Poproś o plik z przycisku „Przenieś na inne urządzenie" ' +
        '— zwykły wydruk PDF nie wystarczy (dane gubi też ponowne zapisanie pliku innym programem).'
      )
    }
    file = extracted
  }

  const { default: JSZip } = await import('jszip')
  let zip
  try {
    zip = await JSZip.loadAsync(file)
  } catch (e) {
    throw new Error('Nie udało się otworzyć paczki — czy to jest plik .suresync lub PDF z danymi?')
  }

  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) throw new Error('Paczka jest uszkodzona — brak manifest.json')

  let manifest
  try {
    manifest = JSON.parse(await manifestFile.async('string'))
  } catch (e) {
    throw new Error('Manifest paczki nie jest prawidłowy JSON')
  }

  if (manifest.format !== FORMAT) {
    throw new Error(`Nieobsługiwana wersja paczki: ${manifest.format} (apka obsługuje ${FORMAT})`)
  }

  // Wyciągnij dane raportu(ów) do podglądu w dialogu
  let payload = null
  if (manifest.bundleType === 'single-report') {
    const rf = zip.file('report.json')
    if (!rf) throw new Error('Paczka deklaruje single-report ale brak report.json')
    const report = JSON.parse(await rf.async('string'))
    payload = { mode: 'single', report }
  } else if (manifest.bundleType === 'all-reports') {
    const rf = zip.file('reports.json')
    if (!rf) throw new Error('Paczka deklaruje all-reports ale brak reports.json')
    const reports = JSON.parse(await rf.async('string'))
    payload = { mode: 'all', reports }
  } else {
    throw new Error(`Nieznany bundleType: ${manifest.bundleType}`)
  }

  // Wykryj konflikty
  const existing = loadAll()
  const existingById = new Map(existing.map((r) => [r.id, r]))
  const conflicts = []
  const incomingReports = payload.mode === 'single' ? [payload.report] : payload.reports
  for (const r of incomingReports) {
    if (existingById.has(r.id)) {
      conflicts.push({
        id: r.id,
        incoming: r,
        existing: existingById.get(r.id),
      })
    }
  }

  return { zip, manifest, payload, conflicts }
}

// ---------- Import — restore media + raport(y) ----------

// Odtwarza wszystkie media z paczki do IndexedDB.
async function restoreMedia(zip) {
  const files = zip.files

  // Images (thumbnails) — odtwarzamy z base64 do dataURL
  for (const filename of Object.keys(files)) {
    const m = filename.match(/^images\/thumb_([^/]+)\.([a-z0-9]+)$/i)
    if (!m) continue
    const id = m[1]
    const blob = await files[filename].async('blob')
    const dataUrl = await blobToDataUrl(blob)
    await replaceImage(id, dataUrl)
  }

  // Originals
  for (const filename of Object.keys(files)) {
    const m = filename.match(/^originals\/orig_([^/]+)\.([a-z0-9]+)$/i)
    if (!m) continue
    const id = m[1]
    const blob = await files[filename].async('blob')
    await replaceOriginal(id, blob)
  }

  // Videos
  for (const filename of Object.keys(files)) {
    const m = filename.match(/^videos\/([^/]+)\.([a-z0-9]+)$/i)
    if (!m) continue
    const id = m[1]
    const blob = await files[filename].async('blob')
    await replaceVideo(id, blob)
  }
}

// Importuje paczkę — `resolutions` to obiekt mapujący id raportu → akcja
// dla każdego konfliktu: 'overwrite' | 'copy' | 'skip'. Dla raportów które
// nie istnieją lokalnie wstawiamy bezpośrednio.
export async function importPackage(zip, payload, resolutions = {}) {
  await restoreMedia(zip)

  const incoming = payload.mode === 'single' ? [payload.report] : payload.reports
  const existing = loadAll()
  const existingById = new Map(existing.map((r) => [r.id, r]))

  const imported = []
  const skipped = []

  for (const r of incoming) {
    const isConflict = existingById.has(r.id)
    const action = isConflict ? (resolutions[r.id] || 'skip') : 'overwrite'

    if (action === 'skip') {
      skipped.push(r)
      continue
    }

    if (action === 'copy') {
      const clone = {
        ...r,
        id: newId(),
        status: r.status === 'completed' ? 'draft' : r.status,
        header: {
          ...r.header,
          reportNumber: (r.header?.reportNumber || '') + ' (kopia)',
        },
        updatedAt: new Date().toISOString(),
      }
      upsert(clone)
      imported.push(clone)
    } else {
      // 'overwrite' — replace existing (lub wstaw nowy jeśli nie istnieje)
      upsert(r)
      imported.push(r)
    }
  }

  return { imported, skipped }
}

// ---------- Web Share API ----------

// Czysty download — zapisuje plik lokalnie przez `<a download>`. Na iOS plik
// trafia do Files apki (skąd user może przesunąć do dowolnego File Providera
// w tym OneDrive). Wywoływane bezpośrednio gdy user wybiera "Zapisz plik".
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

// Czy urządzenie potrafi udostępniać PLIKI przez Web Share API (iOS/Android).
// Na desktopie zwykle false → UI pokazuje wtedy klasyczne „Pobierz".
export function canShareFiles() {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare) return false
    const probe = new File(['x'], 'probe.txt', { type: 'text/plain' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

// Generyczne udostępnienie DOWOLNEGO pliku przez Web Share API z opcjonalnym
// tematem (title) i treścią (text) — używane przez reklamację do wysłania PDF
// mailem do zakupowca. W odróżnieniu od shareOrDownload (paczki .zip) tu
// PODAJEMY title+text, bo celem jest e-mail: Outlook/Mail tworzy wiadomość
// z załączonym PDF, tematem i treścią. Adresata user wybiera/wkleja.
// Fallback: pobranie pliku.
export async function shareFileOrDownload(blob, filename, mime, { title, text } = {}) {
  const file = new File([blob], filename, { type: mime || 'application/octet-stream' })
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      const payload = { files: [file] }
      if (title) payload.title = title
      if (text) payload.text = text
      await navigator.share(payload)
      return true
    } catch (e) {
      if (e.name === 'AbortError') return false
      console.warn('Web Share (file) failed, falling back to download:', e)
    }
  }
  downloadBlob(blob, filename)
  return false
}

// Próbuje udostępnić paczkę przez systemowe menu Share (AirDrop / Mail / etc).
// Wraca true gdy się udało, false gdy przeglądarka nie wspiera lub user
// anulował — wtedy caller robi fallback do downloadu.
//
// UWAGA dla iOS: przekazujemy TYLKO `files` (bez `title`/`text`). Na iPhone
// dorzucenie `text` powoduje że niektóre apki (OneDrive, Drive, Dropbox)
// filtrują się ze share sheet, bo traktują share jako "tekst + plik" i nie
// wspierają takiego mieszanego payload. Czysty file-only share daje pełną
// listę kompatybilnych apek.
export async function shareOrDownload(blob, filename /* , title — usunięte */) {
  const file = new File([blob], filename, { type: 'application/zip' })

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (e) {
      if (e.name === 'AbortError') return false
      console.warn('Web Share failed, falling back to download:', e)
    }
  }

  downloadBlob(blob, filename)
  return false
}

// Nazwa pliku eksportu: `sync_` prefix + numer + data + `.zip`.
// Używamy `.zip` (nie `.suresync`) bo iOS Share Sheet pokazuje tylko apki
// które wspierają zarejestrowany UTI typu pliku. `.suresync` jest nieznane
// systemowi → OneDrive/Drive/Dropbox iOS go ignorują w share sheet.
// `.zip` ma znany UTI `public.zip-archive` → każda apka akceptuje.
// Weryfikacja "czy to nasza paczka" idzie przez manifest.json wewnątrz ZIP.
export function makePackageFilename(report) {
  const num = slugify(report.header?.reportNumber || 'raport')
  const date = report.header?.date || new Date().toISOString().slice(0, 10)
  return `sync_${num}_${date}.zip`
}

export function makeBackupFilename() {
  // Data + godzina-minuta, żeby kilka backupów tego samego dnia nie nadpisywało
  // się w folderze Pobrane (wcześniej sama data → kolizja nazw).
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`
  return `backup_raporty-sure_${stamp}.zip`
}

// Wspólny przepływ pełnego backupu (Reports „💾 Backup" + baner ostrzeżeń o
// pamięci). Buduje paczkę ze WSZYSTKICH raportów, udostępnia/pobiera i stempluje
// znacznik ostatniego backupu. Zwraca liczbę zapakowanych raportów.
export async function backupAllReports() {
  const count = loadAll().length
  const blob = await exportAllReportsPackage()
  await shareOrDownload(blob, makeBackupFilename(), `Backup raportów SURE (${count})`)
  setLastBackupAt()
  return count
}
