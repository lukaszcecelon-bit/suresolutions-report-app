import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import logoUrl from '../assets/logo.png'
import { getImages } from './imageStore.js'
import { collectPhotoIds } from './storage.js'

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

function buildCommissioningHtml(report) {
  const h = report.header || {}
  const totalRunMs = report.sessionStartAt && report.sessionEndAt
    ? new Date(report.sessionEndAt) - new Date(report.sessionStartAt)
    : 0
  const totalStopMs = (report.stops || []).reduce((s, st) => s + (st.durationMs || 0), 0)
  const longest = (report.stops || []).reduce((m, st) => Math.max(m, st.durationMs || 0), 0)

  const stopsRows = (report.stops || []).map((s, i) => {
    const photos = (s.media || []).filter((m) => m.kind === 'image').length
    const videos = (s.media || []).filter((m) => m.kind === 'video').length
    const mediaCell = photos === 0 && videos === 0
      ? '—'
      : `${photos > 0 ? `Zdj. ${photos}` : ''}${photos > 0 && videos > 0 ? ' · ' : ''}${videos > 0 ? `Wid. ${videos}` : ''}`
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

  // photos & videos collected across stops + general
  const allPhotos = []
  const allVideos = []
  ;(report.stops || []).forEach((s, idx) => {
    ;(s.media || []).forEach((m) => {
      const ctx = `Zatrzymanie #${idx + 1} — ${s.reason === 'Inne' && s.customReason ? s.customReason : s.reason}`
      if (m.kind === 'image') allPhotos.push({ ...m, context: ctx })
      else if (m.kind === 'video') allVideos.push({ ...m, context: ctx })
    })
  })
  ;(report.generalMedia || []).forEach((m) => {
    if (m.kind === 'image') allPhotos.push({ ...m, context: 'Dokumentacja ogólna' })
    else if (m.kind === 'video') allVideos.push({ ...m, context: 'Dokumentacja ogólna' })
  })

  const photosHtml = allPhotos.length > 0 ? `
    <h2>Dokumentacja fotograficzna</h2>
    <div class="photos">
      ${allPhotos.map((p, i) => `
        <div class="photo">
          <div class="photo-num">Zdj. ${i + 1}</div>
          <img src="${p.dataUrl}" />
          <div class="photo-ctx">${esc(p.context)}</div>
          ${p.description ? `<div class="photo-desc">${esc(p.description)}</div>` : ''}
          <div class="photo-file">Plik: ${esc(p.filename || '—')}</div>
        </div>
      `).join('')}
    </div>
  ` : ''

  const videosHtml = allVideos.length > 0 ? `
    <h2>Dokumentacja wideo</h2>
    <table class="stops">
      <thead>
        <tr><th>Nr</th><th>Kontekst</th><th>Opis</th><th>Plik</th></tr>
      </thead>
      <tbody>
        ${allVideos.map((v, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(v.context)}</td>
            <td>${esc(v.description || '—')}</td>
            <td>${esc(v.filename || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p class="note">Pliki wideo nie są osadzone w PDF — wyślij je osobno na folder projektu.</p>
  ` : ''

  return `
  <div class="page">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${logoUrl}" class="logo" />
        <div class="company">SureSolutions</div>
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
    <div class="text-block">${esc(report.observations || '—').replace(/\n/g, '<br/>')}</div>

    <h2>Wnioski i rekomendacje</h2>
    <div class="text-block">${esc(report.conclusions || '—').replace(/\n/g, '<br/>')}</div>

    ${photosHtml}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
      <span>SureSolutions</span>
    </div>
  </div>
  `
}

const CSS = `
  * { box-sizing: border-box; }
  .page {
    width: 794px;
    padding: 40px 48px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1F2937;
    background: #fff;
    font-size: 12px;
    line-height: 1.45;
  }
  .hdr {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1F2937; padding-bottom: 14px; margin-bottom: 16px;
  }
  .hdr-left { display: flex; align-items: center; gap: 14px; }
  .logo { height: 56px; width: auto; }
  .company { font-size: 18px; font-weight: 700; color: #1F2937; }
  .hdr-right { text-align: right; }
  .title { font-size: 16px; font-weight: 700; color: #1F2937; letter-spacing: 0.3px; }
  .num { font-size: 13px; color: #4B5563; margin-top: 4px; }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  .meta td { padding: 4px 8px; vertical-align: top; }
  .lbl { color: #6B7280; font-size: 11px; }
  h2 {
    font-size: 13px; text-transform: uppercase; letter-spacing: 0.6px;
    color: #1F2937; margin: 18px 0 8px 0; border-bottom: 1px solid #D1D5DB; padding-bottom: 4px;
  }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .stat { background: #F3F4F6; border-left: 3px solid #3D70B2; padding: 10px 12px; border-radius: 4px; }
  .stat-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #6B7280; }
  .stat-val { font-size: 18px; font-weight: 700; color: #1F2937; margin-top: 2px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  table.stops { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.stops th, table.stops td { border: 1px solid #D1D5DB; padding: 6px 8px; text-align: left; vertical-align: top; }
  table.stops th { background: #F3F4F6; font-weight: 600; color: #1F2937; }
  table.stops tr:nth-child(even) td { background: #FAFAFA; }
  .text-block { white-space: pre-wrap; background: #FAFAFA; border: 1px solid #E5E7EB; padding: 10px 12px; border-radius: 4px; min-height: 40px; }
  .empty { color: #6B7280; font-style: italic; }
  .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .photo { border: 1px solid #D1D5DB; border-radius: 4px; overflow: hidden; background: #FAFAFA; }
  .photo img { width: 100%; height: 140px; object-fit: cover; display: block; }
  .photo-num { font-size: 10px; font-weight: 700; padding: 4px 8px 0; color: #1F2937; }
  .photo-ctx { font-size: 9px; color: #6B7280; padding: 0 8px; }
  .photo-desc { font-size: 10px; color: #1F2937; padding: 2px 8px; }
  .photo-file { font-size: 8px; color: #9CA3AF; padding: 2px 8px 6px; font-family: ui-monospace, monospace; word-break: break-all; }
  .note { font-size: 10px; color: #6B7280; font-style: italic; margin-top: 4px; }
  .footer {
    margin-top: 28px; padding-top: 10px; border-top: 1px solid #D1D5DB;
    display: flex; justify-content: space-between; font-size: 10px; color: #6B7280;
  }
`

async function renderHtmlToPdf(html, fname) {
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
      const pageHeightPx = Math.floor((pageH * canvas.width) / pageW)
      let y = 0
      let isFirst = true
      while (y < canvas.height) {
        const sliceH = Math.min(pageHeightPx, canvas.height - y)
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = sliceH
        const ctx = slice.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, slice.width, slice.height)
        ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        const sliceImgH = (sliceH * imgW) / canvas.width
        if (!isFirst) pdf.addPage()
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, sliceImgH)
        isFirst = false
        y += sliceH
      }
    }
    pdf.save(fname)
  } finally {
    document.body.removeChild(container)
  }
}

function pdfFilename(report, fallback = 'raport') {
  return `${(report.header?.reportNumber || fallback).replace(/[^\w\-]+/g, '_')}_${report.header?.date || 'data'}.pdf`
}

function renderPhotosVideosHtml(allPhotos, allVideos) {
  const photosHtml = allPhotos.length > 0 ? `
    <h2>Dokumentacja fotograficzna</h2>
    <div class="photos">
      ${allPhotos.map((p, i) => `
        <div class="photo">
          <div class="photo-num">Zdj. ${i + 1}</div>
          <img src="${p.dataUrl}" />
          ${p.context ? `<div class="photo-ctx">${esc(p.context)}</div>` : ''}
          ${p.description ? `<div class="photo-desc">${esc(p.description)}</div>` : ''}
          <div class="photo-file">Plik: ${esc(p.filename || '—')}</div>
        </div>
      `).join('')}
    </div>
  ` : ''

  const videosHtml = allVideos.length > 0 ? `
    <h2>Dokumentacja wideo</h2>
    <table class="stops">
      <thead>
        <tr><th>Nr</th>${allVideos.some((v) => v.context) ? '<th>Kontekst</th>' : ''}<th>Opis</th><th>Plik</th></tr>
      </thead>
      <tbody>
        ${allVideos.map((v, i) => `
          <tr>
            <td>${i + 1}</td>
            ${allVideos.some((x) => x.context) ? `<td>${esc(v.context || '—')}</td>` : ''}
            <td>${esc(v.description || '—')}</td>
            <td>${esc(v.filename || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p class="note">Pliki wideo nie są osadzone w PDF — wyślij je osobno na folder projektu.</p>
  ` : ''
  return { photosHtml, videosHtml }
}

export async function generateCommissioningPdf(report) {
  const r = await resolveReportPhotos(report)
  await renderHtmlToPdf(buildCommissioningHtml(r), pdfFilename(r))
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

function buildServiceHtml(report) {
  const h = report.header || {}
  const v = report.visit || {}

  const allPhotos = []
  const allVideos = []
  ;(report.actions || []).forEach((a, idx) => {
    ;(a.media || []).forEach((m) => {
      const ctx = `Czynność #${idx + 1} — ${a.category || '—'}`
      if (m.kind === 'image') allPhotos.push({ ...m, context: ctx })
    })
  })
  ;(report.media || []).forEach((m) => {
    if (m.kind === 'image') allPhotos.push({ ...m, context: 'Dokumentacja ogólna' })
    else if (m.kind === 'video') allVideos.push({ ...m, context: 'Dokumentacja ogólna' })
  })
  const { photosHtml, videosHtml } = renderPhotosVideosHtml(allPhotos, allVideos)

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
        <div class="company">SureSolutions</div>
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
    <div class="text-block">${esc(report.observations || '—').replace(/\n/g, '<br/>')}</div>

    <h2>E. Rekomendacje</h2>
    <div class="text-block">${esc(report.recommendations || '—').replace(/\n/g, '<br/>')}</div>

    ${photosHtml}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
      <span>SureSolutions</span>
    </div>
  </div>
  `
}

export async function generateServicePdf(report) {
  const r = await resolveReportPhotos(report)
  await renderHtmlToPdf(buildServiceHtml(r), pdfFilename(r, 'serwis'))
}

const SAMPLE_METHOD_LABELS = {
  print3d: 'Druk 3D',
  cnc: 'Obróbka CNC',
  other: 'Inne',
}

const POINT_RESULT_LABELS = {
  ok: '✓ OK',
  nok: '✗ NOK',
  cond: '~ Warunkowo',
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

function buildPrototypeHtml(report) {
  const h = report.header || {}
  const info = report.info || {}
  const cond = report.conditions || {}

  const allPhotos = []
  const allVideos = []
  ;(report.info?.media || []).forEach((m) => {
    if (m.kind === 'image') allPhotos.push({ ...m, context: 'Sekcja A — Informacje o teście' })
  })
  ;(report.points || []).forEach((pt, idx) => {
    ;(pt.media || []).forEach((m) => {
      const ctx = `Punkt #${idx + 1}${pt.description ? ' — ' + pt.description : ''} (${POINT_RESULT_LABELS[pt.result] || ''})`
      if (m.kind === 'image') allPhotos.push({ ...m, context: ctx })
    })
  })
  ;(report.resultsMedia || []).forEach((m) => {
    if (m.kind === 'image') allPhotos.push({ ...m, context: 'Sekcja C — Wyniki testu (ogólne)' })
  })
  ;(report.observationsMedia || []).forEach((m) => {
    if (m.kind === 'image') allPhotos.push({ ...m, context: 'Sekcja D — Obserwacje i wnioski' })
  })
  ;(report.media || []).forEach((m) => {
    if (m.kind === 'image') allPhotos.push({ ...m, context: 'Dokumentacja ogólna' })
    else if (m.kind === 'video') allVideos.push({ ...m, context: 'Dokumentacja ogólna' })
  })
  const { photosHtml, videosHtml } = renderPhotosVideosHtml(allPhotos, allVideos)

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
        <div class="company">SureSolutions</div>
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
    <div class="text-block" style="margin-top:8px"><span class="lbl">Cel testu:</span><br/>${esc(info.goal || '—').replace(/\n/g, '<br/>')}</div>

    <h2>B. Warunki testu</h2>
    <div class="text-block"><span class="lbl">Setup:</span><br/>${esc(cond.setup || '—').replace(/\n/g, '<br/>')}</div>
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
    <div class="text-block">${esc(report.observations || '—').replace(/\n/g, '<br/>')}</div>

    <h2>E. Decyzja</h2>
    <div style="margin-bottom:6px"><strong>${esc(DECISION_LABELS[report.decision] || '—')}</strong></div>
    <div class="text-block">${esc(report.decisionNotes || '—').replace(/\n/g, '<br/>')}</div>

    ${photosHtml}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
      <span>SureSolutions</span>
    </div>
  </div>
  `
}

export async function generatePrototypePdf(report) {
  const r = await resolveReportPhotos(report)
  const iter = r.info?.iteration || 1
  const baseName = (r.header?.reportNumber || 'prototyp').replace(/[^\w\-]+/g, '_')
  const fname = `${baseName}_test${iter}_${r.header?.date || 'data'}.pdf`
  await renderHtmlToPdf(buildPrototypeHtml(r), fname)
}
