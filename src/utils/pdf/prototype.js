// Raport TESTÓW PROTOTYPU — natywny tekst.
import {
  makeReportGenerators, mediaCollector, thumbDescriptors,
  fileBase, slugify,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawStatCards,
  drawTable, drawTextBlock, drawThumbsRow, drawVideosTable, drawBadge,
  drawEmpty, drawPhotoAppendix,
} from './core.js'
import { durationBetweenLabel } from '../time.js'
import { reportClient } from '../reportFields.js'

const SAMPLE_METHOD_LABELS = { print3d: 'Druk 3D', cnc: 'Obróbka CNC', other: 'Inne' }
const OVERALL_RESULT_LABELS = { positive: 'Pozytywny', negative: 'Negatywny', conditional: 'Warunkowo pozytywny' }
const DECISION_BADGE = {
  implement: { text: 'Wdrożyć rozwiązanie', kind: 'completed' },
  iterate: { text: 'Poprawki / kolejna iteracja', kind: 'info' },
  reject: { text: 'Odrzucić koncepcję', kind: 'rejected' },
}
const POINT_BADGE = {
  ok: { text: 'OK', kind: 'completed' },
  nok: { text: 'NOK', kind: 'rejected' },
  cond: { text: 'Warunkowo', kind: 'warning' },
}
const POINT_RESULT_SLUGS = { ok: 'OK', nok: 'NOK', cond: 'Warunkowo' }

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  push(report.info?.media, 'Sekcja A — Informacje o teście', 'Sekcja-A_Informacje')
  ;(report.points || []).forEach((pt, idx) => {
    const ctxLabel = `Punkt #${idx + 1}${pt.description ? ' — ' + pt.description : ''} (${POINT_BADGE[pt.result]?.text || ''})`
    const descSlug = pt.description ? '_' + slugify(pt.description) : ''
    push(pt.media, ctxLabel, `Punkt-${idx + 1}_${POINT_RESULT_SLUGS[pt.result] || 'X'}${descSlug}`)
  })
  push(report.resultsMedia, 'Sekcja C — Wyniki testu (ogólne)', 'Sekcja-C_Wyniki')
  push(report.observationsMedia, 'Sekcja D — Obserwacje i wnioski', 'Sekcja-D_Obserwacje')
  push(report.media, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  return finalize()
}

function buildPdf(ctx, report, photos, videos) {
  const h = report.header || {}
  const info = report.info || {}
  const cond = report.conditions || {}
  const W = ctx.contentW
  const iter = info.iteration || 1
  const sampleMethod = info.sampleMethod === 'other'
    ? (info.sampleMethodOther || 'Inne')
    : (SAMPLE_METHOD_LABELS[info.sampleMethod] || '—')

  drawReportHeader(ctx, { title: 'RAPORT TESTÓW PROTOTYPU', subtitle: 'Test #' + iter, number: h.reportNumber })

  drawMetaTable(ctx, [
    [{ label: 'Projekt', value: h.projectName || '—' }, { label: 'Maszyna', value: h.machineName || '—' }, { label: 'Data', value: h.date || '—' }],
    [{ label: 'Autor', value: h.author || '—' }, { label: 'Ocena ogólna', value: OVERALL_RESULT_LABELS[report.overallResult] || '—', colspan: 2 }],
  ])

  drawSectionHeader(ctx, 'A. Informacje o teście')
  drawMetaTable(ctx, [
    [
      { label: 'Podzespół', value: info.component || '—' },
      { label: 'Iteracja', value: 'Test #' + iter },
      { label: 'Metoda próbki', value: sampleMethod },
    ],
    [
      { label: 'Klient', value: reportClient(report) || '—' },
      { label: 'Godziny testu', value: [info.startTime, info.endTime].filter(Boolean).join(' – ') || '—' },
      { label: 'Czas testu', value: durationBetweenLabel(info.startTime, info.endTime) || '—' },
    ],
  ])
  drawTextBlock(ctx, info.goal, { label: 'Cel testu:' })
  drawThumbsRow(ctx, thumbDescriptors(info.media))

  drawSectionHeader(ctx, 'B. Warunki testu')
  drawTextBlock(ctx, cond.setup, { label: 'Setup:' })
  if ((cond.params || []).length === 0) {
    drawEmpty(ctx, 'Brak parametrów.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Parametr', dataKey: 'key', width: 70 },
        { header: 'Wartość', dataKey: 'value', width: W - 12 - 70 },
      ],
      rows: cond.params.map((p, i) => ({ nr: i + 1, key: p.key || '—', value: p.value || '—' })),
    })
  }

  const okCount = (report.points || []).filter((p) => p.result === 'ok').length
  const nokCount = (report.points || []).filter((p) => p.result === 'nok').length
  const condCount = (report.points || []).filter((p) => p.result === 'cond').length

  drawSectionHeader(ctx, 'C. Wyniki testu')
  drawStatCards(ctx, [
    { label: 'Punkty kontrolne', value: report.points?.length || 0 },
    { label: 'OK', value: okCount },
    { label: 'NOK', value: nokCount },
    { label: 'Warunkowo', value: condCount },
  ])
  if ((report.points || []).length === 0) {
    drawEmpty(ctx, 'Brak punktów kontrolnych.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Punkt kontrolny', dataKey: 'punkt', width: 55 },
        { header: 'Wynik', dataKey: 'wynik', width: 24, align: 'center' },
        { header: 'Komentarz', dataKey: 'comment', width: W - 12 - 55 - 24 },
      ],
      rows: report.points.map((p, i) => ({
        nr: i + 1, punkt: p.description || '—', wynik: '', _wynik: p.result,
        comment: p.comment || '', _thumbs: thumbDescriptors(p.media),
      })),
      badge: { col: 'wynik', resolve: (r) => POINT_BADGE[r._wynik] },
      thumbsCol: 'comment', thumbsKey: '_thumbs',
    })
  }
  drawThumbsRow(ctx, thumbDescriptors(report.resultsMedia))

  drawSectionHeader(ctx, 'D. Obserwacje i wnioski')
  drawTextBlock(ctx, report.observations)
  drawThumbsRow(ctx, thumbDescriptors(report.observationsMedia))

  drawSectionHeader(ctx, 'E. Decyzja')
  if (DECISION_BADGE[report.decision]) drawBadge(ctx, DECISION_BADGE[report.decision].text, DECISION_BADGE[report.decision].kind)
  drawTextBlock(ctx, report.decisionNotes)

  const generalThumbs = thumbDescriptors(report.media)
  if (generalThumbs.length) {
    drawSectionHeader(ctx, 'Dokumentacja ogólna')
    drawThumbsRow(ctx, generalThumbs)
  }

  drawPhotoAppendix(ctx, photos)

  drawVideosTable(ctx, videos)
}

// Numer raportu (PRT-…-data) + numer iteracji. Datę ma już numer — nie dublujemy.
function baseName(r) {
  const iter = r.info?.iteration || 1
  return `${fileBase(r, 'prototyp')}_test${iter}`
}

const gen = makeReportGenerators(collectMedia, buildPdf, baseName)
export const buildPrototypePdf = gen.pdf
export const buildPrototypePackage = gen.pkg
