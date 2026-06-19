// ZGŁOSZENIE WADY / REKLAMACJA — natywny tekst.
// Inne podejście do zdjęć: DUŻE zdjęcia-dowody (contain), bo zdjęcie wady to
// główny dowód dla dostawcy — nie małe miniaturki.
import {
  buildReportPdf, mediaCollector, buildLinkMaps, evidenceDescriptors,
  assemblePackage, downloadBlob, slugify,
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

function baseName(r) {
  const baseNum = (r.header?.reportNumber || 'reklamacja').replace(/[^\w\-]+/g, '_')
  return `${baseNum}_${r.header?.date || 'data'}`
}

// Sam PDF (z dużymi zdjęciami-dowodami osadzonymi w treści) — odbiorca otwiera
// jeden plik, bez rozpakowywania paczki.
export async function generateComplaintPdf(report) {
  const { r, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  downloadBlob(pdfBlob, baseName(r) + '.pdf')
}

// Buduje paczkę ZIP reklamacji (PDF + zdjęcia w PEŁNEJ rozdzielczości) i zwraca
// { blob, filename } BEZ pobierania — caller albo pobiera (komputer), albo
// udostępnia przez Web Share (telefon → Outlook z załącznikiem).
export async function generateComplaintZip(report) {
  const { r, photos, videos, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  return await assemblePackage(pdfBlob, photos, videos, baseName(r))
}

export async function generateComplaintPackage(report) {
  const pack = await generateComplaintZip(report)
  downloadBlob(pack.blob, pack.filename)
}
