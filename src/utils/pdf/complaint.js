// ZGŁOSZENIE WADY / REKLAMACJA — natywny tekst.
// Inne podejście do zdjęć: DUŻE zdjęcia-dowody (contain), bo zdjęcie wady to
// główny dowód dla dostawcy — nie małe miniaturki.
import {
  makeReportGenerators, mediaCollector, evidenceDescriptors,
  fileBase, slugify,
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
  const blocks = !!report.blocksAssembly

  drawReportHeader(ctx, { title: 'ZGŁOSZENIE WADY / REKLAMACJA', number: h.reportNumber })

  if (blocks) drawBlockerBanner(ctx, 'BLOKUJE MONTAŻ — wymaga pilnej reakcji')

  const metaRows = [
    [{ label: 'Nr projektu', value: h.projectNumber || '—' }, { label: 'Część (nr / nazwa)', value: report.partNo || '—' }, { label: 'Data', value: h.date || '—' }],
    [{ label: 'Kategoria wady', value: report.defectCategory || '—' }, { label: 'Zgłaszający', value: h.author || '—' }, { label: 'Blokuje montaż', value: blocks ? 'TAK' : 'nie' }],
  ]
  // Dostawca zawsze widoczny (v0.52) — pusty pokazuje „—", żeby brak od razu
  // kłuł w oczy: bez niego nie da się zestawić reklamacji per dostawca.
  metaRows.push([{ label: 'Dostawca', value: report.supplier || '—', colspan: 3 }])
  if (report.buyerEmail) metaRows.push([{ label: 'Adresat (zakupowiec)', value: report.buyerEmail, colspan: 3 }])
  drawMetaTable(ctx, metaRows)

  drawSectionHeader(ctx, 'Opis wady')
  drawTextBlock(ctx, report.description)

  const evidence = evidenceDescriptors(report.media)
  if (evidence.length === 0) {
    drawSectionHeader(ctx, 'Dokumentacja zdjęciowa')
    drawEmpty(ctx, 'Brak zdjęć — dołącz zdjęcie wady.')
  } else {
    drawSectionHeader(ctx, 'Dokumentacja zdjęciowa', 60)
    drawEvidencePhotos(ctx, evidence)
  }
}

// Numer reklamacji (REK-…-data) używany wprost jako nazwa pliku (bez podwójnej daty).
// Buildery { blob, filename } (bez pobierania). PDF ma duże zdjęcia-dowody
// osadzone w treści (odbiorca otwiera jeden plik); ZIP dokłada zdjęcia w pełnej
// rozdzielczości. Używane przez useReportPage ORAZ wysyłkę do zakupowca.
const gen = makeReportGenerators(collectMedia, buildPdf, (r) => fileBase(r, 'reklamacja'))
export const buildComplaintPdf = gen.pdf
export const buildComplaintPackage = gen.pkg
