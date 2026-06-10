// Raport ODBIORU SAT / FAT — builder HTML + paczka.
import {
  logoUrl, esc, nowStamp, textLines, textWithThumbs, thumbsSection,
  buildLinkMaps, renderVideosHtml, mediaCollector, slugify,
  resolveReportPhotos, renderHtmlToBlob, assemblePackage, downloadBlob,
} from './core.js'

const TITLES = {
  fat: 'RAPORT ODBIORU FABRYCZNEGO (FAT)',
  sat: 'RAPORT ODBIORU NA OBIEKCIE (SAT)',
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

const PUNCHLIST_PRIORITY_SLUGS = {
  critical: 'KRYT',
  major:    'IST',
  minor:    'DROB',
}

const FINAL_STATUS_LABELS = {
  accepted:    '✓ Zaakceptowano',
  conditional: '~ Zaakceptowano warunkowo',
  rejected:    '✗ Odrzucono',
}

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  ;(report.tests || []).forEach((t, idx) => {
    const desc = t.description ? ' — ' + t.description.slice(0, 50) : ''
    const ctxLabel = `Test #${idx + 1}${desc} (${TEST_STATUS_LABELS[t.status] || ''})`
    const descSlug = t.description ? '_' + slugify(t.description) : ''
    push(t.media,
      ctxLabel,
      `Test-${idx + 1}_${TEST_STATUS_SLUGS[t.status] || 'X'}${descSlug}`)
  })
  ;(report.punchlist || []).forEach((p, idx) => {
    const desc = p.description ? ' — ' + p.description.slice(0, 50) : ''
    const ctxLabel = `Usterka #${idx + 1}${desc} (${PUNCHLIST_PRIORITY_LABELS[p.priority] || ''})`
    const descSlug = p.description ? '_' + slugify(p.description) : ''
    push(p.media,
      ctxLabel,
      `Usterka-${idx + 1}_${PUNCHLIST_PRIORITY_SLUGS[p.priority] || 'X'}${descSlug}`)
  })
  push(report.media, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  return finalize()
}

function buildHtml(report, photos, videos) {
  const h = report.header || {}
  const info = report.info || {}
  const sigs = report.signatures || {}
  const { photoMap } = buildLinkMaps(photos)
  const videosHtml = renderVideosHtml(videos)

  const title = TITLES[report.testType === 'sat' ? 'sat' : 'fat']

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
        </tr>
      </thead>
      <tbody>
        ${(report.tests || []).map((t, i) => {
          return `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(t.description || '—').replace(/\n/g, '<br/>')}</td>
            <td>${esc(t.criterion || '—')}</td>
            <td>${esc(TEST_STATUS_LABELS[t.status] || '—')}</td>
            <td>${textWithThumbs(t.notes, t.media, photoMap)}</td>
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
            <td>${textWithThumbs(p.notes, p.media, photoMap)}</td>
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

    ${thumbsSection('H. Dokumentacja fotograficzna (ogólna)', report.media, photoMap)}
    ${videosHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

export async function generateSatFatPackage(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectMedia(r)
  const html = buildHtml(r, photos, videos)
  const pdfBlob = await renderHtmlToBlob(html)
  const typeTag = (r.testType || 'fat').toUpperCase()
  const baseNum = (r.header?.reportNumber || 'odbior').replace(/[^\w\-]+/g, '_')
  const baseName = `${baseNum}_${typeTag}_${r.header?.date || 'data'}`
  const pack = await assemblePackage(pdfBlob, photos, videos, baseName)
  downloadBlob(pack.blob, pack.filename)
}
