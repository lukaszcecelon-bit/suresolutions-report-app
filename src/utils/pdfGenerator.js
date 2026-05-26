// jspdf, html2canvas and jszip are HEAVY (~700KB combined). They are loaded
// lazily — only when the user actually triggers a "Pobierz paczkę". This keeps
// the initial app bundle ~4x smaller for users who just browse / view reports.
// Call `warmupLibs()` from an idle handler to pre-fetch in the background so
// the first download click doesn't pay the network cost.
import logoUrl from '../assets/logo.png'
import { getImages, getVideos, getOriginals } from './imageStore.js'
import { collectPhotoIds } from './storage.js'

export async function warmupLibs() {
  await Promise.all([
    import('jspdf').catch(() => {}),
    import('html2canvas').catch(() => {}),
    import('jszip').catch(() => {}),
  ])
}

function slugify(s) {
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

function downloadBlob(blob, filename) {
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

function deepCloneWithPhotos(value, resolved) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => deepCloneWithPhotos(v, resolved))
  const out = {}
  for (const k of Object.keys(value)) out[k] = deepCloneWithPhotos(value[k], resolved)
  if (out.kind === 'image' && !out.dataUrl && out.photoId && resolved.has(out.photoId)) {
    out.dataUrl = resolved.get(out.photoId)
  }
  return out
}

async function resolveReportPhotos(report) {
  const ids = Array.from(collectPhotoIds(report))
  if (ids.length === 0) return report
  const map = await getImages(ids)
  return deepCloneWithPhotos(report, map)
}

const TYPE_TITLES = {
  commissioning: 'RAPORT URUCHOMIENIA / OBSERWACJI MASZYNY',
  service: 'RAPORT SERWISU NA OBIEKCIE',
  prototype: 'RAPORT TESTÓW PROTOTYPU',
  satfat_fat: 'RAPORT ODBIORU FABRYCZNEGO (FAT)',
  satfat_sat: 'RAPORT ODBIORU NA OBIEKCIE (SAT)',
}

const TEST_STATUS_LABELS = {
  pass:        '✓ Zaliczony',
  fail:        '✗ Niezaliczony',
  conditional: '~ Warunkowo',
  na:          '— N/A',
}

const TEST_STATUS_SLUGS = {
  pass:        'PASS',
  fail:        'FAIL',
  conditional: 'COND',
  na:          'NA',
}

const PUNCHLIST_PRIORITY_LABELS = {
  critical: '🔴 Krytyczne',
  major:    '🟡 Istotne',
  minor:    '🟢 Drobne',
}

const FINAL_STATUS_LABELS = {
  accepted:    '✓ Zaakceptowano',
  conditional: '~ Zaakceptowano warunkowo',
  rejected:    '✗ Odrzucono',
}

const POINT_RESULT_LABELS = {
  ok: '✓ OK',
  nok: '✗ NOK',
  cond: '~ Warunkowo',
}

const POINT_RESULT_SLUGS = {
  ok: 'OK',
  nok: 'NOK',
  cond: 'Warunkowo',
}

function collectAllMedia(report) {
  const items = []
  const push = (mediaArr, ctxLabel, ctxSlug) => {
    for (const m of (mediaArr || [])) {
      items.push({ ...m, _ctxLabel: ctxLabel, _ctxSlug: ctxSlug })
    }
  }

  if (report.type === 'commissioning') {
    ;(report.stops || []).forEach((s, idx) => {
      const reason = s.reason === 'Inne' && s.customReason ? s.customReason : (s.reason || '')
      push(s.media,
        `Zatrzymanie #${idx + 1} — ${reason}`,
        `Zatrzymanie-${idx + 1}_${slugify(reason) || 'X'}`)
    })
    push(report.generalMedia, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  } else if (report.type === 'service') {
    ;(report.actions || []).forEach((a, idx) => {
      const cat = a.category || ''
      push(a.media,
        `Czynność #${idx + 1} — ${cat}`,
        `Czynnosc-${idx + 1}_${slugify(cat) || 'X'}`)
    })
    push(report.media, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  } else if (report.type === 'prototype') {
    push(report.info?.media, 'Sekcja A — Informacje o teście', 'Sekcja-A_Informacje')
    ;(report.points || []).forEach((pt, idx) => {
      const ctxLabel = `Punkt #${idx + 1}${pt.description ? ' — ' + pt.description : ''} (${POINT_RESULT_LABELS[pt.result] || ''})`
      const descSlug = pt.description ? '_' + slugify(pt.description) : ''
      push(pt.media,
        ctxLabel,
        `Punkt-${idx + 1}_${POINT_RESULT_SLUGS[pt.result] || 'X'}${descSlug}`)
    })
    push(report.resultsMedia, 'Sekcja C — Wyniki testu (ogólne)', 'Sekcja-C_Wyniki')
    push(report.observationsMedia, 'Sekcja D — Obserwacje i wnioski', 'Sekcja-D_Obserwacje')
    push(report.media, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  } else if (report.type === 'satfat') {
    ;(report.tests || []).forEach((t, idx) => {
      const desc = t.description ? ' — ' + t.description.slice(0, 50) : ''
      const ctxLabel = `Test #${idx + 1}${desc} (${TEST_STATUS_LABELS[t.status] || ''})`
      const descSlug = t.description ? '_' + slugify(t.description) : ''
      push(t.media,
        ctxLabel,
        `Test-${idx + 1}_${TEST_STATUS_SLUGS[t.status] || 'X'}${descSlug}`)
    })
    push(report.media, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  }

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

function formatDurationFull(ms) {
  if (!ms || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDurationShort(ms) {
  if (!ms || ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s} s`
  return `${m} min ${s} s`
}

function timeHHMM(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function nowStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function esc(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Każdy logiczny wiersz (rozdzielony \n) trafia do osobnego <div class="text-line">.
// Dzięki temu algorytm łamania stron mierzy bounding rect KAŻDEJ linii osobno
// i jeśli granica strony wypada w środku text-bloku, cofa się DO POCZĄTKU linii,
// która by została pocięta — zamiast tnąć ją poziomo na pół.
// Bez tego wszystkie linie text-bloku renderowane przez `.replace(/\n/g, '<br/>')`
// były jednym ciągłym blokiem i slicer canvas tnął gdzie wypadnie.
function textLines(s) {
  if (s === null || s === undefined || !String(s).trim()) {
    return '<div class="text-line">—</div>'
  }
  return String(s).split('\n').map((line) => {
    return `<div class="text-line">${line ? esc(line) : '&nbsp;'}</div>`
  }).join('')
}

function buildCommissioningHtml(report, photos, videos) {
  const h = report.header || {}
  const totalRunMs = report.sessionStartAt && report.sessionEndAt
    ? new Date(report.sessionEndAt) - new Date(report.sessionStartAt)
    : 0
  const totalStopMs = (report.stops || []).reduce((s, st) => s + (st.durationMs || 0), 0)
  const longest = (report.stops || []).reduce((m, st) => Math.max(m, st.durationMs || 0), 0)

  const stopsRows = (report.stops || []).map((s, i) => {
    const ph = (s.media || []).filter((m) => m.kind === 'image').length
    const vd = (s.media || []).filter((m) => m.kind === 'video').length
    const mediaCell = ph === 0 && vd === 0
      ? '—'
      : `${ph > 0 ? `Zdj. ${ph}` : ''}${ph > 0 && vd > 0 ? ' · ' : ''}${vd > 0 ? `Wid. ${vd}` : ''}`
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(timeHHMM(s.startAt))}</td>
      <td>${esc(formatDurationShort(s.durationMs))}</td>
      <td>${esc(s.reason === 'Inne' && s.customReason ? s.customReason : s.reason)}</td>
      <td>${esc(s.comment || '—')}</td>
      <td>${esc(mediaCell)}</td>
    </tr>
  `}).join('')

  const { photosHtml, videosHtml } = renderPhotosVideosHtml(photos, videos)

  return `
  <div class="page">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${logoUrl}" class="logo" />
      </div>
      <div class="hdr-right">
        <div class="title">${esc(TYPE_TITLES.commissioning)}</div>
        <div class="num">Nr: <strong>${esc(h.reportNumber || '—')}</strong></div>
      </div>
    </div>

    <table class="meta">
      <tr>
        <td><span class="lbl">Projekt:</span> ${esc(h.projectName || '—')}</td>
        <td><span class="lbl">Maszyna:</span> ${esc(h.machineName || '—')}</td>
        <td><span class="lbl">Data:</span> ${esc(h.date || '—')}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="lbl">Autor:</span> ${esc(h.author || '—')}</td>
        <td><span class="lbl">Start sesji:</span> ${esc(timeHHMM(report.sessionStartAt))} — <span class="lbl">Koniec:</span> ${esc(timeHHMM(report.sessionEndAt))}</td>
      </tr>
    </table>

    <h2>Podsumowanie statystyk</h2>
    <div class="stats">
      <div class="stat"><div class="stat-lbl">Całkowity czas pracy</div><div class="stat-val mono">${formatDurationFull(totalRunMs)}</div></div>
      <div class="stat"><div class="stat-lbl">Liczba zatrzymań</div><div class="stat-val">${report.stops?.length || 0}</div></div>
      <div class="stat"><div class="stat-lbl">Łączny czas przestojów</div><div class="stat-val">${formatDurationShort(totalStopMs)}</div></div>
      <div class="stat"><div class="stat-lbl">Najdłuższe zatrzymanie</div><div class="stat-val">${formatDurationShort(longest)}</div></div>
    </div>

    <h2>Log zatrzymań</h2>
    ${stopsRows ? `
      <table class="stops">
        <thead>
          <tr><th>Nr</th><th>Godzina</th><th>Czas trwania</th><th>Powód</th><th>Komentarz</th><th>Media</th></tr>
        </thead>
        <tbody>${stopsRows}</tbody>
      </table>
    ` : '<p class="empty">Brak zatrzymań — maszyna pracowała bez przestojów.</p>'}

    <h2>Obserwacje ogólne</h2>
    <div class="text-block">${textLines(report.observations)}</div>

    <h2>Wnioski i rekomendacje</h2>
    <div class="text-block">${textLines(report.conclusions)}</div>

    ${photosHtml}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
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

async function renderHtmlToBlob(html) {
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
    const NO_BREAK_SELECTORS = '.photo, table, thead, tbody tr, .stat, .info-card, .sig-box, .text-block, .text-line, h2'
    const nodeRect = node.getBoundingClientRect()
    const sourceHeightPx = node.offsetHeight
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
        // wygląda jak zerwany nagłówek tabeli. Z tym fixem thead idzie razem
        // z pierwszym wierszem (i wszelkie kolejne wiersze już mają własną
        // ochronę przez `tbody tr` w NO_BREAK_SELECTORS).
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

    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height * imgW) / canvas.width

    if (imgH <= pageH) {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH)
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
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, yOffsetMm, imgW, sliceImgH)
        isFirst = false
        y = pageEnd
      }
    }
    return pdf.output('blob')
  } finally {
    document.body.removeChild(container)
  }
}

function fileBase(report, fallback = 'raport') {
  const num = (report.header?.reportNumber || fallback).replace(/[^\w\-]+/g, '_')
  return `${num}_${report.header?.date || 'data'}`
}

async function assemblePackage(pdfBlob, photos, videos, baseName) {
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

function renderPhotosVideosHtml(allPhotos, allVideos) {
  const photosHtml = allPhotos.length > 0 ? `
    <h2>Dokumentacja fotograficzna</h2>
    <p class="note">Pełne pliki znajdziesz w paczce ZIP w folderze <strong>zdjecia/</strong>.</p>
    <div class="photos">
      ${allPhotos.map((p, i) => `
        <div class="photo">
          ${p.dataUrl ? `<img src="${p.dataUrl}" />` : '<div style="height:220px;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:11px;background:#F3F4F6;border-bottom:1px solid #D1D5DB">(brak miniatury)</div>'}
          <div class="photo-meta">
            <div class="photo-num">Zdj. ${String(i + 1).padStart(2, '0')}</div>
            ${p._ctxLabel ? `<div class="photo-ctx">${esc(p._ctxLabel)}</div>` : ''}
            ${p.description ? `<div class="photo-desc">${esc(p.description)}</div>` : ''}
            <div class="photo-file">📁 ${esc(p._zipFilename || p.filename || '—')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  ` : ''

  const videosHtml = allVideos.length > 0 ? `
    <h2>Dokumentacja wideo</h2>
    <p class="note">Pełne pliki wideo znajdziesz w paczce ZIP w folderze <strong>wideo/</strong>.</p>
    <table class="stops">
      <thead>
        <tr><th style="width:36px">Nr</th><th>Kontekst</th><th>Opis</th><th>Plik w paczce</th></tr>
      </thead>
      <tbody>
        ${allVideos.map((v, i) => `
          <tr>
            <td>${String(i + 1).padStart(2, '0')}</td>
            <td>${esc(v._ctxLabel || '—')}</td>
            <td>${esc(v.description || '—')}</td>
            <td>📁 ${esc(v._zipFilename || v.filename || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : ''
  return { photosHtml, videosHtml }
}

export async function generateCommissioningPackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectAllMedia(r)
  const html = buildCommissioningHtml(r, photos, videos)
  const pdfBlob = await renderHtmlToBlob(html)
  const pack = await assemblePackage(pdfBlob, photos, videos, fileBase(r))
  downloadBlob(pack.blob, pack.filename)
}

const PRIORITY_LABELS = {
  urgent: '🔴 Pilne',
  planned: '🟡 Planowe',
  watch: '🟢 Obserwacja',
}

const VISIT_STATUS_LABELS = {
  completed: '✓ Zakończona',
  followup: '⏳ Wymaga follow-up',
  parts: '🔧 Oczekuje na części',
}

function buildServiceHtml(report, photos, videos) {
  const h = report.header || {}
  const v = report.visit || {}
  const { photosHtml, videosHtml } = renderPhotosVideosHtml(photos, videos)

  const actionsHtml = (report.actions || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th style="width:110px">Kategoria</th>
          <th>Opis czynności</th>
          <th style="width:60px">Zdj.</th>
        </tr>
      </thead>
      <tbody>
        ${(report.actions || []).map((a, i) => {
          const photoCount = (a.media || []).filter((m) => m.kind === 'image').length
          return `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(a.category || '—')}</td>
            <td>${esc(a.description || '—').replace(/\n/g, '<br/>')}</td>
            <td>${photoCount > 0 ? `📷 ${photoCount}` : '—'}</td>
          </tr>
        `}).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak wpisów.</p>'

  const partsHtml = (report.parts || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th>Element</th>
          <th style="width:110px">Nr katalogowy</th>
          <th style="width:110px">Priorytet</th>
          <th>Komentarz</th>
        </tr>
      </thead>
      <tbody>
        ${(report.parts || []).map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(p.name || '—')}</td>
            <td>${esc(p.catalogNo || '—')}</td>
            <td>${esc(PRIORITY_LABELS[p.priority] || p.priority || '—')}</td>
            <td>${esc(p.comment || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak wpisów.</p>'

  return `
  <div class="page">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${logoUrl}" class="logo" />
      </div>
      <div class="hdr-right">
        <div class="title">${esc(TYPE_TITLES.service)}</div>
        <div class="num">Nr: <strong>${esc(h.reportNumber || '—')}</strong></div>
      </div>
    </div>

    <table class="meta">
      <tr>
        <td><span class="lbl">Projekt:</span> ${esc(h.projectName || '—')}</td>
        <td><span class="lbl">Maszyna:</span> ${esc(h.machineName || '—')}</td>
        <td><span class="lbl">Data:</span> ${esc(h.date || '—')}</td>
      </tr>
      <tr>
        <td><span class="lbl">Autor:</span> ${esc(h.author || '—')}</td>
        <td colspan="2"><span class="lbl">Status wizyty:</span> <strong>${esc(VISIT_STATUS_LABELS[report.visitStatus] || '—')}</strong></td>
      </tr>
    </table>

    <h2>A. Dane wizyty</h2>
    <table class="meta">
      <tr>
        <td><span class="lbl">Klient:</span> ${esc(v.client || '—')}</td>
        <td><span class="lbl">Lokalizacja:</span> ${esc(v.location || '—')}</td>
      </tr>
      <tr>
        <td><span class="lbl">Przyjazd:</span> ${esc(v.arrival || '—')}</td>
        <td><span class="lbl">Odjazd:</span> ${esc(v.departure || '—')}</td>
      </tr>
    </table>

    <h2>B. Wykonane czynności (${(report.actions || []).length})</h2>
    ${actionsHtml}

    <h2>C. Elementy do wymiany / uwagi (${(report.parts || []).length})</h2>
    ${partsHtml}

    <h2>D. Obserwacje własne</h2>
    <div class="text-block">${textLines(report.observations)}</div>

    <h2>E. Rekomendacje</h2>
    <div class="text-block">${textLines(report.recommendations)}</div>

    ${photosHtml}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

export async function generateServicePackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectAllMedia(r)
  const html = buildServiceHtml(r, photos, videos)
  const pdfBlob = await renderHtmlToBlob(html)
  const pack = await assemblePackage(pdfBlob, photos, videos, fileBase(r, 'serwis'))
  downloadBlob(pack.blob, pack.filename)
}

const SAMPLE_METHOD_LABELS = {
  print3d: 'Druk 3D',
  cnc: 'Obróbka CNC',
  other: 'Inne',
}

const OVERALL_RESULT_LABELS = {
  positive: '✓ Pozytywny',
  negative: '✗ Negatywny',
  conditional: '~ Warunkowo pozytywny',
}

const DECISION_LABELS = {
  implement: '✓ Wdrożyć rozwiązanie',
  iterate: '⟳ Poprawki → kolejna iteracja',
  reject: '✗ Odrzucić koncepcję',
}

function buildPrototypeHtml(report, photos, videos) {
  const h = report.header || {}
  const info = report.info || {}
  const cond = report.conditions || {}
  const { photosHtml, videosHtml } = renderPhotosVideosHtml(photos, videos)

  const sampleMethod = info.sampleMethod === 'other'
    ? (info.sampleMethodOther || 'Inne')
    : (SAMPLE_METHOD_LABELS[info.sampleMethod] || '—')

  const paramsHtml = (cond.params || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr><th style="width:36px">Nr</th><th>Parametr</th><th>Wartość</th></tr>
      </thead>
      <tbody>
        ${(cond.params || []).map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(p.key || '—')}</td>
            <td>${esc(p.value || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak parametrów.</p>'

  const pointsHtml = (report.points || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th>Punkt kontrolny</th>
          <th style="width:90px">Wynik</th>
          <th>Komentarz</th>
          <th style="width:60px">Zdj.</th>
        </tr>
      </thead>
      <tbody>
        ${(report.points || []).map((p, i) => {
          const photoCount = (p.media || []).filter((m) => m.kind === 'image').length
          return `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(p.description || '—')}</td>
            <td>${esc(POINT_RESULT_LABELS[p.result] || '—')}</td>
            <td>${esc(p.comment || '—')}</td>
            <td>${photoCount > 0 ? `📷 ${photoCount}` : '—'}</td>
          </tr>
        `}).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak punktów kontrolnych.</p>'

  const okCount = (report.points || []).filter((p) => p.result === 'ok').length
  const nokCount = (report.points || []).filter((p) => p.result === 'nok').length
  const condCount = (report.points || []).filter((p) => p.result === 'cond').length

  return `
  <div class="page">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${logoUrl}" class="logo" />
      </div>
      <div class="hdr-right">
        <div class="title">${esc(TYPE_TITLES.prototype)} · Test #${esc(info.iteration || 1)}</div>
        <div class="num">Nr: <strong>${esc(h.reportNumber || '—')}</strong></div>
      </div>
    </div>

    <table class="meta">
      <tr>
        <td><span class="lbl">Projekt:</span> ${esc(h.projectName || '—')}</td>
        <td><span class="lbl">Maszyna:</span> ${esc(h.machineName || '—')}</td>
        <td><span class="lbl">Data:</span> ${esc(h.date || '—')}</td>
      </tr>
      <tr>
        <td><span class="lbl">Autor:</span> ${esc(h.author || '—')}</td>
        <td colspan="2"><span class="lbl">Ocena ogólna:</span> <strong>${esc(OVERALL_RESULT_LABELS[report.overallResult] || '—')}</strong></td>
      </tr>
    </table>

    <h2>A. Informacje o teście</h2>
    <table class="meta">
      <tr>
        <td><span class="lbl">Podzespół:</span> ${esc(info.component || '—')}</td>
        <td><span class="lbl">Iteracja:</span> Test #${esc(info.iteration || 1)}</td>
        <td><span class="lbl">Metoda próbki:</span> ${esc(sampleMethod)}</td>
      </tr>
    </table>
    <div class="text-block" style="margin-top:8px"><span class="lbl">Cel testu:</span>${textLines(info.goal)}</div>

    <h2>B. Warunki testu</h2>
    <div class="text-block"><span class="lbl">Setup:</span>${textLines(cond.setup)}</div>
    <div style="margin-top:8px"><span class="lbl">Parametry:</span></div>
    ${paramsHtml}

    <h2>C. Wyniki testu</h2>
    <div class="stats">
      <div class="stat"><div class="stat-lbl">Punkty kontrolne</div><div class="stat-val">${report.points?.length || 0}</div></div>
      <div class="stat"><div class="stat-lbl">OK</div><div class="stat-val">${okCount}</div></div>
      <div class="stat"><div class="stat-lbl">NOK</div><div class="stat-val">${nokCount}</div></div>
      <div class="stat"><div class="stat-lbl">Warunkowo</div><div class="stat-val">${condCount}</div></div>
    </div>
    <div style="margin-top:10px"></div>
    ${pointsHtml}

    <h2>D. Obserwacje i wnioski</h2>
    <div class="text-block">${textLines(report.observations)}</div>

    <h2>E. Decyzja</h2>
    <div style="margin-bottom:6px"><strong>${esc(DECISION_LABELS[report.decision] || '—')}</strong></div>
    <div class="text-block">${textLines(report.decisionNotes)}</div>

    ${photosHtml}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

export async function generatePrototypePackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectAllMedia(r)
  const html = buildPrototypeHtml(r, photos, videos)
  const pdfBlob = await renderHtmlToBlob(html)
  const iter = r.info?.iteration || 1
  const baseNum = (r.header?.reportNumber || 'prototyp').replace(/[^\w\-]+/g, '_')
  const baseName = `${baseNum}_test${iter}_${r.header?.date || 'data'}`
  const pack = await assemblePackage(pdfBlob, photos, videos, baseName)
  downloadBlob(pack.blob, pack.filename)
}

// ============================== SAT / FAT ==============================

function buildSatFatHtml(report, photos, videos) {
  const h = report.header || {}
  const info = report.info || {}
  const sigs = report.signatures || {}
  const { photosHtml, videosHtml } = renderPhotosVideosHtml(photos, videos)

  const titleKey = report.testType === 'sat' ? 'satfat_sat' : 'satfat_fat'
  const title = TYPE_TITLES[titleKey]

  const passCount = (report.tests || []).filter((t) => t.status === 'pass').length
  const failCount = (report.tests || []).filter((t) => t.status === 'fail').length
  const condCount = (report.tests || []).filter((t) => t.status === 'conditional').length
  const naCount   = (report.tests || []).filter((t) => t.status === 'na').length

  const participantsHtml = (list) => {
    if (!list || list.length === 0) {
      return '<p class="empty">Nie podano osób.</p>'
    }
    return `
      <table class="stops">
        <thead>
          <tr><th style="width:36px">Nr</th><th>Imię i nazwisko</th><th>Funkcja / stanowisko</th></tr>
        </thead>
        <tbody>
          ${list.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(p.name || '—')}</td>
              <td>${esc(p.role || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
  }

  const testsHtml = (report.tests || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th>Opis testu / co testowane</th>
          <th>Kryterium akceptacji</th>
          <th style="width:110px">Wynik</th>
          <th>Uwagi</th>
          <th style="width:60px">Zdj.</th>
        </tr>
      </thead>
      <tbody>
        ${(report.tests || []).map((t, i) => {
          const photoCount = (t.media || []).filter((m) => m.kind === 'image').length
          return `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(t.description || '—').replace(/\n/g, '<br/>')}</td>
            <td>${esc(t.criterion || '—')}</td>
            <td>${esc(TEST_STATUS_LABELS[t.status] || '—')}</td>
            <td>${esc(t.notes || '—').replace(/\n/g, '<br/>')}</td>
            <td>${photoCount > 0 ? `📷 ${photoCount}` : '—'}</td>
          </tr>
        `}).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak zdefiniowanych testów.</p>'

  const punchHtml = (report.punchlist || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th style="width:110px">Priorytet</th>
          <th>Opis usterki</th>
          <th>Uwagi</th>
        </tr>
      </thead>
      <tbody>
        ${(report.punchlist || []).map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(PUNCHLIST_PRIORITY_LABELS[p.priority] || p.priority || '—')}</td>
            <td>${esc(p.description || '—')}</td>
            <td>${esc(p.notes || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak usterek — wszystko OK.</p>'

  // Pick a badge class for the final status banner
  const finalBadgeClass =
    report.finalStatus === 'accepted'    ? 'completed' :
    report.finalStatus === 'conditional' ? 'warning'   :
    report.finalStatus === 'rejected'    ? 'rejected'  : 'info'

  return `
  <div class="page">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${logoUrl}" class="logo" />
      </div>
      <div class="hdr-right">
        <div class="title">${esc(title)}</div>
        <div class="num">Nr: <strong>${esc(h.reportNumber || '—')}</strong></div>
      </div>
    </div>

    <table class="meta">
      <tr>
        <td><span class="lbl">Projekt:</span> ${esc(h.projectName || '—')}</td>
        <td><span class="lbl">Maszyna:</span> ${esc(h.machineName || '—')}</td>
        <td><span class="lbl">Data:</span> ${esc(h.date || '—')}</td>
      </tr>
      <tr>
        <td><span class="lbl">Autor:</span> ${esc(h.author || '—')}</td>
        <td><span class="lbl">Typ odbioru:</span> <strong>${esc(report.testType === 'sat' ? 'SAT (na obiekcie)' : 'FAT (u producenta)')}</strong></td>
        <td><span class="lbl">Status:</span> <span class="badge ${finalBadgeClass}">${esc(FINAL_STATUS_LABELS[report.finalStatus] || '—')}</span></td>
      </tr>
    </table>

    <h2>A. Kontekst odbioru</h2>
    <table class="meta">
      <tr>
        <td><span class="lbl">Klient:</span> ${esc(info.client || '—')}</td>
        <td><span class="lbl">Lokalizacja:</span> ${esc(info.location || '—')}</td>
      </tr>
      <tr>
        <td colspan="2"><span class="lbl">Dokument referencyjny:</span> ${esc(info.referenceDoc || '—')}</td>
      </tr>
    </table>

    <h2>B. Uczestnicy odbioru</h2>
    <div class="info-card">
      <div class="lbl" style="margin-bottom:4px">Strona klienta</div>
      ${participantsHtml(report.participants?.client)}
    </div>
    <div class="info-card" style="margin-top:10px">
      <div class="lbl" style="margin-bottom:4px">Strona wykonawcy (SureSolutions)</div>
      ${participantsHtml(report.participants?.vendor)}
    </div>

    <h2>C. Testy odbiorowe</h2>
    <div class="stats">
      <div class="stat"><div class="stat-lbl">Wszystkie</div><div class="stat-val">${report.tests?.length || 0}</div></div>
      <div class="stat"><div class="stat-lbl">Zaliczone</div><div class="stat-val">${passCount}</div></div>
      <div class="stat"><div class="stat-lbl">Warunkowo</div><div class="stat-val">${condCount}</div></div>
      <div class="stat"><div class="stat-lbl">Niezaliczone</div><div class="stat-val">${failCount}</div></div>
    </div>
    ${naCount > 0 ? `<p class="note">Pominięte (N/A): ${naCount}</p>` : ''}
    <div style="margin-top:10px"></div>
    ${testsHtml}

    <h2>D. Lista usterek (punchlist) (${report.punchlist?.length || 0})</h2>
    ${punchHtml}

    <h2>E. Status końcowy odbioru</h2>
    <div style="margin-bottom:6px"><span class="badge ${finalBadgeClass}" style="font-size:13px;padding:6px 14px">${esc(FINAL_STATUS_LABELS[report.finalStatus] || '—')}</span></div>

    <h2>F. Wnioski i komentarze</h2>
    <div class="text-block">${textLines(report.conclusions)}</div>

    <h2>G. Podpisy stron</h2>
    <div class="signatures">
      <div class="sig-box">
        <div class="sig-lbl">Strona klienta</div>
        <div class="sig-line"></div>
        <div class="sig-name">${esc(sigs.clientName || '')}</div>
        <div class="sig-date">${esc(sigs.clientDate || '')}</div>
      </div>
      <div class="sig-box">
        <div class="sig-lbl">Strona wykonawcy</div>
        <div class="sig-line"></div>
        <div class="sig-name">${esc(sigs.vendorName || '')}</div>
        <div class="sig-date">${esc(sigs.vendorDate || '')}</div>
      </div>
    </div>

    ${photosHtml}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

export async function generateSatFatPackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectAllMedia(r)
  const html = buildSatFatHtml(r, photos, videos)
  const pdfBlob = await renderHtmlToBlob(html)
  const typeTag = (r.testType || 'fat').toUpperCase()
  const baseNum = (r.header?.reportNumber || 'odbior').replace(/[^\w\-]+/g, '_')
  const baseName = `${baseNum}_${typeTag}_${r.header?.date || 'data'}`
  const pack = await assemblePackage(pdfBlob, photos, videos, baseName)
  downloadBlob(pack.blob, pack.filename)
}
