// LEKCJA PROJEKTOWA — feedback do konstrukcji (Lessons Learned).
// Natywny tekst (jsPDF + autotable + Roboto). Kontekst i klasyfikacja lądują
// w meta-tabeli; opis błędu, skutek i wnioski to bloki/tabela z miniaturkami.
import {
  makeReportGenerators, mediaCollector, thumbDescriptors,
  fileBase,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawTable,
  drawTextBlock, drawThumbsRow, drawEmpty, drawPhotoAppendix,
} from './core.js'

// Istotność → badge (te same kolory co reszta apki).
const SEVERITY_BADGE = {
  critical: { text: 'Krytyczny', kind: 'rejected' },
  major: { text: 'Poważny', kind: 'warning' },
  minor: { text: 'Drobny', kind: 'neutral' },
}

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  push(report.problemMedia, 'Błąd projektowy', 'Blad')
  ;(Array.isArray(report.lessons) ? report.lessons : []).forEach((o, idx) => {
    push(o.media, `Wniosek #${idx + 1}`, `Wniosek-${idx + 1}`)
  })
  return finalize()
}

function buildPdf(ctx, report, photos) {
  const h = report.header || {}
  const lessons = Array.isArray(report.lessons) ? report.lessons : []
  const W = ctx.contentW

  drawReportHeader(ctx, { title: 'LEKCJA PROJEKTOWA — FEEDBACK DO KONSTRUKCJI', number: h.reportNumber })

  const sevCell = report.severity && SEVERITY_BADGE[report.severity]
    ? { label: 'Istotność', badge: SEVERITY_BADGE[report.severity] }
    : { label: 'Istotność', value: '—' }

  drawMetaTable(ctx, [
    [{ label: 'Projekt', value: h.projectName || '—' }, { label: 'Maszyna', value: h.machineName || '—' }, { label: 'Data', value: h.date || '—' }],
    [{ label: 'Autor', value: h.author || '—' }, { label: 'Etap wykrycia', value: report.stage || '—' }, { label: 'Nr rysunku / DTR', value: report.drawingNo || '—' }],
    [{ label: 'Kategoria błędu', value: report.category || '—', colspan: 2 }, sevCell],
  ])

  drawSectionHeader(ctx, 'Opis błędu projektowego')
  drawTextBlock(ctx, report.problem)
  const problemThumbs = thumbDescriptors(report.problemMedia)
  if (problemThumbs.length) drawThumbsRow(ctx, problemThumbs)

  drawSectionHeader(ctx, 'Skutek / wpływ')
  drawTextBlock(ctx, report.impact)

  drawSectionHeader(ctx, `Wnioski / rekomendacje dla konstrukcji (${lessons.length})`)
  if (lessons.length === 0) {
    drawEmpty(ctx, 'Brak wniosków.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Wniosek', dataKey: 'text', width: W - 12 },
      ],
      rows: lessons.map((o, i) => ({ nr: i + 1, text: o.text || '', _thumbs: thumbDescriptors(o.media) })),
      thumbsCol: 'text', thumbsKey: '_thumbs',
    })
  }

  drawPhotoAppendix(ctx, photos)
}

const baseName = (r) => fileBase(r, 'lekcja')
const gen = makeReportGenerators(collectMedia, buildPdf, baseName)
export const buildLessonPdf = gen.pdf
export const buildLessonPackage = gen.pkg
