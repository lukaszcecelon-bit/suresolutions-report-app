// Raport URUCHOMIENIA / OBSERWACJI MASZYNY — natywny tekst.
import {
  makeReportGenerators, mediaCollector, thumbDescriptors,
  fileBase, slugify,
  timeHHMM, formatDurationFull, formatDurationShort,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawStatCards,
  drawTable, drawTextBlock, drawThumbsRow, drawVideosTable, drawPhotoAppendix, drawEmpty,
} from './core.js'
import { reportClient } from '../reportFields.js'

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  ;(report.stops || []).forEach((s, idx) => {
    const reason = s.reason === 'Inne' && s.customReason ? s.customReason : (s.reason || '')
    push(s.media, `Zatrzymanie #${idx + 1} — ${reason}`, `Zatrzymanie-${idx + 1}_${slugify(reason) || 'X'}`)
  })
  ;(Array.isArray(report.observations) ? report.observations : []).forEach((o, idx) => {
    push(o.media, `Obserwacja #${idx + 1}`, `Obserwacja-${idx + 1}`)
  })
  ;(Array.isArray(report.conclusions) ? report.conclusions : []).forEach((o, idx) => {
    push(o.media, `Wniosek #${idx + 1}`, `Wniosek-${idx + 1}`)
  })
  push(report.generalMedia, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  return finalize()
}

// Sekcja z listą powtarzalnych wpisów {text, media} — jak obserwacje w serwisie.
function notesSection(ctx, title, colHeader, records) {
  const list = Array.isArray(records) ? records : []
  drawSectionHeader(ctx, `${title} (${list.length})`)
  if (!list.length) { drawEmpty(ctx, 'Brak wpisów.'); return }
  drawTable(ctx, {
    columns: [
      { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
      { header: colHeader, dataKey: 'text', width: ctx.contentW - 12 },
    ],
    rows: list.map((o, i) => ({ nr: i + 1, text: o.text || '', _thumbs: thumbDescriptors(o.media) })),
    thumbsCol: 'text', thumbsKey: '_thumbs',
  })
}

function buildPdf(ctx, report, photos, videos) {
  const h = report.header || {}
  const W = ctx.contentW
  const totalRunMs = report.sessionStartAt && report.sessionEndAt
    ? new Date(report.sessionEndAt) - new Date(report.sessionStartAt) : 0
  const totalStopMs = (report.stops || []).reduce((s, st) => s + (st.durationMs || 0), 0)
  const longest = (report.stops || []).reduce((m, st) => Math.max(m, st.durationMs || 0), 0)

  drawReportHeader(ctx, { title: 'RAPORT URUCHOMIENIA / OBSERWACJI MASZYNY', number: h.reportNumber })

  drawMetaTable(ctx, [
    [{ label: 'Projekt', value: h.projectName || '—' }, { label: 'Maszyna', value: h.machineName || '—' }, { label: 'Data', value: h.date || '—' }],
    // Przy raporcie z trybu ręcznego dopisujemy adnotację — czytelnik musi
    // wiedzieć, że godziny wpisano z ręki, a nie zmierzono stoperem.
    [{ label: 'Autor', value: h.author || '—' }, { label: 'Klient', value: reportClient(report) || '—' }, { label: 'Sesja', value: `${timeHHMM(report.sessionStartAt)} — ${timeHHMM(report.sessionEndAt)}${report.manual ? ' (wpisane ręcznie)' : ''}` }],
  ])

  drawSectionHeader(ctx, 'Podsumowanie statystyk')
  drawStatCards(ctx, [
    { label: 'Całkowity czas pracy', value: formatDurationFull(totalRunMs) },
    { label: 'Liczba zatrzymań', value: report.stops?.length || 0 },
    { label: 'Łączny czas przestojów', value: formatDurationShort(totalStopMs) },
    { label: 'Najdłuższe zatrzymanie', value: formatDurationShort(longest) },
  ])

  drawSectionHeader(ctx, 'Log zatrzymań')
  if ((report.stops || []).length === 0) {
    drawTextBlock(ctx, 'Brak zatrzymań — maszyna pracowała bez przestojów.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Godzina', dataKey: 'godz', width: 20 },
        { header: 'Czas trwania', dataKey: 'czas', width: 24 },
        { header: 'Powód', dataKey: 'powod', width: 40 },
        { header: 'Komentarz', dataKey: 'komentarz', width: W - 12 - 20 - 24 - 40 },
      ],
      rows: (report.stops || []).map((s, i) => ({
        nr: i + 1,
        godz: timeHHMM(s.startAt),
        czas: formatDurationShort(s.durationMs),
        powod: s.reason === 'Inne' && s.customReason ? s.customReason : (s.reason || '—'),
        komentarz: s.comment || '',
        _thumbs: thumbDescriptors(s.media),
      })),
      thumbsCol: 'komentarz', thumbsKey: '_thumbs',
    })
  }

  notesSection(ctx, 'Obserwacje', 'Obserwacja', report.observations)
  notesSection(ctx, 'Wnioski i rekomendacje', 'Wniosek / rekomendacja', report.conclusions)

  const generalThumbs = thumbDescriptors(report.generalMedia)
  if (generalThumbs.length) {
    drawSectionHeader(ctx, 'Dokumentacja ogólna')
    drawThumbsRow(ctx, generalThumbs)
  }

  drawPhotoAppendix(ctx, photos)

  drawVideosTable(ctx, videos)
}

const gen = makeReportGenerators(collectMedia, buildPdf, (r) => fileBase(r))
export const buildCommissioningPdf = gen.pdf
export const buildCommissioningPackage = gen.pkg
export const buildCommissioningTransfer = gen.transfer
