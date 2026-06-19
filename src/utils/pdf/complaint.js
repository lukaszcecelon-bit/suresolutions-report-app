// ZGŁOSZENIE WADY / REKLAMACJA — natywny tekst.
// Inne podejście do zdjęć: DUŻE zdjęcia-dowody (contain), bo zdjęcie wady to
// główny dowód dla dostawcy — nie małe miniaturki.
import {
  buildReportPdf, mediaCollector, buildLinkMaps, evidenceDescriptors,
  assemblePackage, slugify,
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

// Buildery zwracają { blob, filename } BEZ pobierania — caller (useReportPage
// / wysyłka do zakupowca) decyduje: pobrać, udostępnić (Web Share) czy załączyć
// do maila. PDF ma duże zdjęcia-dowody osadzone w treści (odbiorca otwiera jeden
// plik bez rozpakowywania); ZIP dokłada zdjęcia w pełnej rozdzielczości.
export async function buildComplaintPdf(report) {
  const { r, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  return { blob: pdfBlob, filename: baseName(r) + '.pdf' }
}

export async function buildComplaintPackage(report) {
  const { r, photos, videos, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  return await assemblePackage(pdfBlob, photos, videos, baseName(r))
}
