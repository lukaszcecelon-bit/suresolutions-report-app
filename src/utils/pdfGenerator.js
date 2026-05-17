import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import logoUrl from '../assets/logo.png'
import { getImages, getVideos } from './imageStore.js'
import { collectPhotoIds } from './storage.js'

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
    white-space: pre-wrap; background: #F9FAFB; border: 1px solid #E5E7EB;
    padding: 12px 14px; border-radius: 4px; min-height: 44px;
    font-size: 12.5px; line-height: 1.6;
  }
  .empty { color: #9CA3AF; font-style: italic; padding: 8px 0; }

  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
  }
  .badge.completed { background: #D1FAE5; color: #065F46; }
  .badge.warning   { background: #FEF3C7; color: #92400E; }
  .badge.info      { background: #DBEAFE; color: #1E40AF; }

  .photos {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
    margin-bottom: 10px;
  }
  .photo {
    border: 1px solid #E5E7EB; border-radius: 6px; overflow: hidden; background: #fff;
  }
  .photo img { width: 100%; height: 220px; object-fit: cover; display: block; background: #F3F4F6; }
  .photo-num {
    font-size: 11px; font-weight: 700; color: #3D70B2; padding: 8px 12px 0;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .photo-ctx { font-size: 10.5px; color: #6B7280; padding: 1px 12px 0; }
  .photo-desc { font-size: 12px; color: #1F2937; padding: 3px 12px 0; line-height: 1.45; }
  .photo-file {
    font-size: 9.5px; color: #9CA3AF; padding: 5px 12px 10px;
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

    // Collect ranges (in canvas-px) of elements that must not be split across pages.
    // We compute these BEFORE html2canvas to use live DOM measurements; the scale
    // factor is constant since the source node has a fixed CSS width.
    const NO_BREAK_SELECTORS = '.photo, tbody tr, .stat, .info-card, h2'
    const nodeRect = node.getBoundingClientRect()
    const sourceHeightPx = node.offsetHeight

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
      const scaleY = canvas.height / sourceHeightPx

      // Build sorted list of no-break ranges in canvas-px space
      const ranges = []
      for (const el of node.querySelectorAll(NO_BREAK_SELECTORS)) {
        const r = el.getBoundingClientRect()
        const top = Math.round((r.top - nodeRect.top) * scaleY)
        const bottom = Math.round((r.bottom - nodeRect.top) * scaleY)
        const h = bottom - top
        // Only protect elements that can actually fit on one page
        if (h > 0 && h <= pageHeightPx - 20) ranges.push([top, bottom])
      }
      ranges.sort((a, b) => a[0] - b[0])

      let y = 0
      let isFirst = true
      while (y < canvas.height) {
        let pageEnd = Math.min(y + pageHeightPx, canvas.height)

        // Pull pageEnd up so we don't slice through a protected element.
        // Iterate because pulling back may reveal an earlier conflict.
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

        // Fallback: if we couldn't fit anything (element too tall), force-fill the page.
        if (pageEnd <= y) pageEnd = Math.min(y + pageHeightPx, canvas.height)

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
        pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, sliceImgH)
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
  const zip = new JSZip()
  zip.file(`${baseName}.pdf`, pdfBlob)

  if (photos.length > 0) {
    const folder = zip.folder('zdjecia')
    for (const p of photos) {
      if (!p.dataUrl) continue
      const base64 = p.dataUrl.replace(/^data:image\/[a-z]+;base64,/, '')
      folder.file(p._zipFilename, base64, { base64: true })
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
          <div class="photo-num">Zdj. ${String(i + 1).padStart(2, '0')}</div>
          ${p.dataUrl ? `<img src="${p.dataUrl}" />` : '<div style="height:220px;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:11px">(brak miniatury)</div>'}
          ${p._ctxLabel ? `<div class="photo-ctx">${esc(p._ctxLabel)}</div>` : ''}
          ${p.description ? `<div class="photo-desc">${esc(p.description)}</div>` : ''}
          <div class="photo-file">📁 ${esc(p._zipFilename || p.filename || '—')}</div>
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
