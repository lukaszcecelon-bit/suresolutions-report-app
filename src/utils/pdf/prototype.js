// Raport TESTÓW PROTOTYPU — builder HTML + paczka.
import {
  logoUrl, esc, nowStamp, textLines, textWithThumbs, renderThumbs,
  thumbsSection, buildLinkMaps, renderVideosHtml, mediaCollector, slugify,
  resolveReportPhotos, renderHtmlToBlob, assemblePackage, downloadBlob,
} from './core.js'

const TITLE = 'RAPORT TESTÓW PROTOTYPU'

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

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
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
  return finalize()
}

function buildHtml(report, photos, videos) {
  const h = report.header || {}
  const info = report.info || {}
  const cond = report.conditions || {}
  const { photoMap } = buildLinkMaps(photos)
  const videosHtml = renderVideosHtml(videos)

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
        </tr>
      </thead>
      <tbody>
        ${(report.points || []).map((p, i) => {
          return `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(p.description || '—')}</td>
            <td>${esc(POINT_RESULT_LABELS[p.result] || '—')}</td>
            <td>${textWithThumbs(p.comment, p.media, photoMap)}</td>
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
        <div class="title">${esc(TITLE)} · Test #${esc(info.iteration || 1)}</div>
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
    ${renderThumbs(info.media, photoMap)}

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
    ${renderThumbs(report.resultsMedia, photoMap)}

    <h2>D. Obserwacje i wnioski</h2>
    <div class="text-block">${textLines(report.observations)}</div>
    ${renderThumbs(report.observationsMedia, photoMap)}

    <h2>E. Decyzja</h2>
    <div style="margin-bottom:6px"><strong>${esc(DECISION_LABELS[report.decision] || '—')}</strong></div>
    <div class="text-block">${textLines(report.decisionNotes)}</div>

    ${thumbsSection('Dokumentacja ogólna', report.media, photoMap)}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

export async function generatePrototypePackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectMedia(r)
  const html = buildHtml(r, photos, videos)
  const pdfBlob = await renderHtmlToBlob(html)
  const iter = r.info?.iteration || 1
  const baseNum = (r.header?.reportNumber || 'prototyp').replace(/[^\w\-]+/g, '_')
  const baseName = `${baseNum}_test${iter}_${r.header?.date || 'data'}`
  const pack = await assemblePackage(pdfBlob, photos, videos, baseName)
  downloadBlob(pack.blob, pack.filename)
}
