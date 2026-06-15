// ZGŁOSZENIE WADY / REKLAMACJA — natywny tekst.
// Inne podejście do zdjęć: DUŻE zdjęcia-dowody (contain), bo zdjęcie wady to
// główny dowód dla dostawcy — nie małe miniaturki.
import {
  resolveReportPhotos, mediaCollector, buildLinkMaps, evidenceDescriptors,
  renderReportToBlob, assemblePackage, downloadBlob, slugify,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawTextBlock,
  drawEvidencePhotos, drawBlockerBanner, drawEmpty,
} from './core.js'

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  const partSlug = slugify(report.partNo) || 'czesc'
  push(report.media, 'Dowód wady', `Wada_${partSlug}`)
  return finalize()
}

function buildPdf(ctx, report, photos) {
  const h = report.header || {}
  const { photoMap } = buildLinkMaps(photos)
  const blocks = !!report.blocksAssembly

  drawReportHeader(ctx, { title: 'ZGŁOSZENIE WADY / REKLAMACJA', number: h.reportNumber })

  if (blocks) drawBlockerBanner(ctx, 'BLOKUJE MONTAŻ — wymaga pilnej reakcji')

  const metaRows = [
    [{ label: 'Nr projektu', value: h.projectNumber || '—' }, { label: 'Część (nr / nazwa)', value: report.partNo || '—' }, { label: 'Data', value: h.date || '—' }],
    [{ label: 'Kategoria wady', value: report.defectCategory || '—' }, { label: 'Zgłaszający', value: h.author || '—' }, { label: 'Blokuje montaż', value: blocks ? 'TAK' : 'nie' }],
  ]
  if (report.buyerEmail) metaRows.push([{ label: 'Adresat (zakupowiec)', value: report.buyerEmail, colspan: 3 }])
  drawMetaTable(ctx, metaRows)

  drawSectionHeader(ctx, 'Opis wady')
  drawTextBlock(ctx, report.description)

  const evidence = evidenceDescriptors(report.media, photoMap)
  if (evidence.length === 0) {
    drawSectionHeader(ctx, 'Dokumentacja zdjęciowa')
    drawEmpty(ctx, 'Brak zdjęć — dołącz zdjęcie wady.')
  } else {
    drawSectionHeader(ctx, 'Dokumentacja zdjęciowa', 60)
    drawEvidencePhotos(ctx, evidence)
  }
}

// Buduje paczkę ZIP reklamacji (PDF + zdjęcia w PEŁNEJ rozdzielczości) i zwraca
// { blob, filename } BEZ pobierania — caller albo pobiera (komputer), albo
// udostępnia przez Web Share (telefon → Outlook z załącznikiem).
export async function generateComplaintZip(report) {
  const r = await resolveReportPhotos(report)
  const { photos, videos } = collectMedia(r)
  const pdfBlob = await renderReportToBlob((ctx) => buildPdf(ctx, r, photos))
  const baseNum = (r.header?.reportNumber || 'reklamacja').replace(/[^\w\-]+/g, '_')
  const baseName = `${baseNum}_${r.header?.date || 'data'}`
  return await assemblePackage(pdfBlob, photos, videos, baseName)
}

export async function generateComplaintPackage(report) {
  const pack = await generateComplaintZip(report)
  downloadBlob(pack.blob, pack.filename)
}
