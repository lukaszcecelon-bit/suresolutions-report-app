// Raport SERWISU NA OBIEKCIE — builder HTML + paczka.
// To jest WZORZEC podejścia do zdjęć w PDF (miniaturki inline pod tekstem,
// klikalne do pełnego pliku w ZIP) — pozostałe typy raportów go naśladują.
import {
  logoUrl, esc, nowStamp, textLines, textWithThumbs, buildLinkMaps,
  mediaCollector, slugify, resolveReportPhotos, renderHtmlToBlob,
  assemblePackage, fileBase, downloadBlob,
} from './core.js'

const TITLE = 'RAPORT SERWISU NA OBIEKCIE'

const PRIORITY_LABELS = {
  urgent: '🔴 Pilne',
  planned: '🟡 Planowe',
  watch: '🟢 Obserwacja',
}

const VISIT_STATUS_LABELS = {
  completed: '✓ Zakończono (maszyna działa)',
  followup: '⏳ Wymaga spotkania / dalszych działań',
  parts: '🔴 Maszyna zatrzymana',
}

// Łączny czas wizyty z godzin HH:MM (z obsługą przejścia przez północ).
function serviceVisitDuration(arrival, departure) {
  if (!arrival || !departure) return null
  const [ah, am] = String(arrival).split(':').map(Number)
  const [dh, dm] = String(departure).split(':').map(Number)
  if ([ah, am, dh, dm].some((n) => Number.isNaN(n))) return null
  let mins = (dh * 60 + dm) - (ah * 60 + am)
  if (mins < 0) mins += 24 * 60
  if (mins === 0) return null
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  return hh > 0 ? `${hh} h ${mm} min` : `${mm} min`
}

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  ;(report.actions || []).forEach((a, idx) => {
    const desc = a.description ? ' — ' + a.description.slice(0, 40) : ''
    push(a.media,
      `Czynność #${idx + 1}${desc}`,
      `Czynnosc-${idx + 1}`)
  })
  ;(report.parts || []).forEach((p, idx) => {
    push(p.media,
      `Element #${idx + 1}${p.name ? ' — ' + p.name : ''}`,
      `Element-${idx + 1}_${slugify(p.name) || 'X'}`)
  })
  ;(Array.isArray(report.observations) ? report.observations : []).forEach((o, idx) => {
    push(o.media,
      `Obserwacja #${idx + 1}`,
      `Obserwacja-${idx + 1}`)
  })
  return finalize()
}

function buildHtml(report, photos /* videos nieużywane w serwisie */) {
  const h = report.header || {}
  const v = report.visit || {}
  const { photoMap } = buildLinkMaps(photos)
  const observations = Array.isArray(report.observations) ? report.observations : []
  const totalTime = serviceVisitDuration(v.arrival, v.departure)

  // B. Czynności — Nr + opis (z miniaturkami pod tekstem). Bez kolumny kategorii i linków.
  const actionsHtml = (report.actions || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th>Opis czynności</th>
        </tr>
      </thead>
      <tbody>
        ${(report.actions || []).map((a, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${textWithThumbs(a.description, a.media, photoMap)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak wpisów.</p>'

  // C. Elementy — miniaturki pod komentarzem.
  const partsHtml = (report.parts || []).length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th>Element</th>
          <th style="width:110px">Nr katalogowy</th>
          <th style="width:90px">Priorytet</th>
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
            <td>${textWithThumbs(p.comment, p.media, photoMap)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak wpisów.</p>'

  // D. Obserwacje — rekordy z miniaturkami (jak czynności).
  const obsHtml = observations.length > 0 ? `
    <table class="stops">
      <thead>
        <tr>
          <th style="width:36px">Nr</th>
          <th>Obserwacja</th>
        </tr>
      </thead>
      <tbody>
        ${observations.map((o, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${textWithThumbs(o.text, o.media, photoMap)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Brak obserwacji.</p>'

  return `
  <div class="page">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${logoUrl}" class="logo" />
      </div>
      <div class="hdr-right">
        <div class="title">${esc(TITLE)}</div>
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
        <td><span class="lbl">Rola:</span> ${esc(report.role || '—')}</td>
        <td><span class="lbl">Status:</span> <strong>${esc(VISIT_STATUS_LABELS[report.visitStatus] || '—')}</strong></td>
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
        <td><span class="lbl">Łączny czas:</span> ${esc(totalTime || '—')}</td>
      </tr>
      <tr>
        <td colspan="3"><span class="lbl">Odbiór prac (kto odebrał):</span> ${esc(report.receivedBy || '—')}</td>
      </tr>
    </table>

    <h2>B. Wykonane czynności (${(report.actions || []).length})</h2>
    ${actionsHtml}

    <h2>C. Elementy do wymiany / uwagi (${(report.parts || []).length})</h2>
    ${partsHtml}

    <h2>D. Obserwacje własne (${observations.length})</h2>
    ${obsHtml}

    <h2>E. Rekomendacje</h2>
    <div class="text-block">${textLines(report.recommendations)}</div>

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

export async function generateServicePackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectMedia(r)
  const html = buildHtml(r, photos)
  const pdfBlob = await renderHtmlToBlob(html)
  const pack = await assemblePackage(pdfBlob, photos, videos, fileBase(r, 'serwis'))
  downloadBlob(pack.blob, pack.filename)
}
