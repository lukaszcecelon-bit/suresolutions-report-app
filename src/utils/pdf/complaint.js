// ZGŁOSZENIE WADY / REKLAMACJA — builder HTML + paczka.
// Celowo INNE podejście do zdjęć niż reszta raportów: zdjęcie wady to główny
// dowód dla dostawcy, więc renderujemy DUŻE zdjęcia-dowody (.evidence,
// object-fit: contain) zamiast małych miniaturek.
import {
  logoUrl, esc, nowStamp, textLines, mediaCollector, slugify,
  resolveReportPhotos, renderHtmlToBlob, assemblePackage, downloadBlob,
} from './core.js'

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  const partSlug = slugify(report.partNo) || 'czesc'
  push(report.media, 'Dowód wady', `Wada_${partSlug}`)
  return finalize()
}

function buildHtml(report, photos) {
  const h = report.header || {}
  const blocks = !!report.blocksAssembly

  const evidenceHtml = photos.length > 0 ? `
    <h2>Dokumentacja zdjęciowa</h2>
    <p class="note">Kliknij zdjęcie aby otworzyć w pełnej rozdzielczości (po rozpakowaniu paczki).</p>
    <div class="evidence ${photos.length === 1 ? 'single' : ''}">
      ${photos.map((p) => {
        const target = p._zipFilename ? `zdjecia/${p._zipFilename}` : null
        const attrs = target ? ` data-link-target="${esc(target)}"` : ''
        return `
        <div class="evidence-item"${attrs}>
          ${p.dataUrl ? `<img src="${p.dataUrl}" />` : '<div style="padding:48px;text-align:center;color:#9CA3AF;font-size:11px">(brak miniatury)</div>'}
          ${p.description ? `<div class="evidence-cap">${esc(p.description)}</div>` : ''}
        </div>`
      }).join('')}
    </div>
  ` : '<p class="empty">Brak zdjęć — dołącz zdjęcie wady.</p>'

  return `
  <div class="page">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${logoUrl}" class="logo" />
      </div>
      <div class="hdr-right">
        <div class="title">ZGŁOSZENIE WADY / REKLAMACJA</div>
        <div class="num">Nr: <strong>${esc(h.reportNumber || '—')}</strong></div>
      </div>
    </div>

    ${blocks ? '<div class="blocker-banner">⛔ BLOKUJE MONTAŻ — wymaga pilnej reakcji</div>' : ''}

    <table class="meta">
      <tr>
        <td><span class="lbl">Nr projektu:</span> ${esc(h.projectNumber || '—')}</td>
        <td><span class="lbl">Część (nr / nazwa):</span> ${esc(report.partNo || '—')}</td>
        <td><span class="lbl">Data:</span> ${esc(h.date || '—')}</td>
      </tr>
      <tr>
        <td><span class="lbl">Kategoria wady:</span> <strong>${esc(report.defectCategory || '—')}</strong></td>
        <td><span class="lbl">Zgłaszający:</span> ${esc(h.author || '—')}</td>
        <td><span class="lbl">Blokuje montaż:</span> <strong>${blocks ? 'TAK' : 'nie'}</strong></td>
      </tr>
      ${report.buyerEmail ? `<tr><td colspan="3"><span class="lbl">Adresat (zakupowiec):</span> ${esc(report.buyerEmail)}</td></tr>` : ''}
    </table>

    <h2>Opis wady</h2>
    <div class="text-block">${textLines(report.description)}</div>

    ${evidenceHtml}

    <div class="footer">
      <span>Wygenerowano: ${nowStamp()}</span>
    </div>
  </div>
  `
}

// Buduje paczkę ZIP reklamacji (PDF + zdjęcia w PEŁNEJ rozdzielczości) i zwraca
// { blob, filename } BEZ pobierania — żeby caller mógł ją albo pobrać (komputer,
// do załączenia w Outlooku), albo udostępnić przez Web Share (telefon → Outlook
// z gotowym załącznikiem).
export async function generateComplaintZip(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectMedia(r)
  const html = buildHtml(r, photos)
  const pdfBlob = await renderHtmlToBlob(html)
  const baseNum = (r.header?.reportNumber || 'reklamacja').replace(/[^\w\-]+/g, '_')
  const baseName = `${baseNum}_${r.header?.date || 'data'}`
  return await assemblePackage(pdfBlob, photos, videos, baseName) // { blob, filename }
}

// Pełna paczka ZIP z pobieraniem — dla listy raportów (Home) i przycisku „Paczka ZIP".
export async function generateComplaintPackage(report) {
  const pack = await generateComplaintZip(report)
  downloadBlob(pack.blob, pack.filename)
}
