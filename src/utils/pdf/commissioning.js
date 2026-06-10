// Raport URUCHOMIENIA / OBSERWACJI MASZYNY — builder HTML + paczka.
import {
  logoUrl, esc, timeHHMM, nowStamp, formatDurationFull, formatDurationShort,
  textLines, textWithThumbs, thumbsSection, buildLinkMaps, renderVideosHtml,
  mediaCollector, slugify, resolveReportPhotos, renderHtmlToBlob,
  assemblePackage, fileBase, downloadBlob,
} from './core.js'

const TITLE = 'RAPORT URUCHOMIENIA / OBSERWACJI MASZYNY'

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  ;(report.stops || []).forEach((s, idx) => {
    const reason = s.reason === 'Inne' && s.customReason ? s.customReason : (s.reason || '')
    push(s.media,
      `Zatrzymanie #${idx + 1} — ${reason}`,
      `Zatrzymanie-${idx + 1}_${slugify(reason) || 'X'}`)
  })
  push(report.generalMedia, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  return finalize()
}

function buildHtml(report, photos, videos) {
  const h = report.header || {}
  const { photoMap } = buildLinkMaps(photos)
  const totalRunMs = report.sessionStartAt && report.sessionEndAt
    ? new Date(report.sessionEndAt) - new Date(report.sessionStartAt)
    : 0
  const totalStopMs = (report.stops || []).reduce((s, st) => s + (st.durationMs || 0), 0)
  const longest = (report.stops || []).reduce((m, st) => Math.max(m, st.durationMs || 0), 0)

  const stopsRows = (report.stops || []).map((s, i) => {
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(timeHHMM(s.startAt))}</td>
      <td>${esc(formatDurationShort(s.durationMs))}</td>
      <td>${esc(s.reason === 'Inne' && s.customReason ? s.customReason : s.reason)}</td>
      <td>${textWithThumbs(s.comment, s.media, photoMap)}</td>
    </tr>
  `}).join('')

  const videosHtml = renderVideosHtml(videos)

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
          <tr><th>Nr</th><th>Godzina</th><th>Czas trwania</th><th>Powód</th><th>Komentarz</th></tr>
        </thead>
        <tbody>${stopsRows}</tbody>
      </table>
    ` : '<p class="empty">Brak zatrzymań — maszyna pracowała bez przestojów.</p>'}

    <h2>Obserwacje ogólne</h2>
    <div class="text-block">${textLines(report.observations)}</div>

    <h2>Wnioski i rekomendacje</h2>
    <div class="text-block">${textLines(report.conclusions)}</div>

    ${thumbsSection('Dokumentacja ogólna', report.generalMedia, photoMap)}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

export async function generateCommissioningPackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectMedia(r)
  const html = buildHtml(r, photos, videos)
  const pdfBlob = await renderHtmlToBlob(html)
  const pack = await assemblePackage(pdfBlob, photos, videos, fileBase(r))
  downloadBlob(pack.blob, pack.filename)
}
