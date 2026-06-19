// Raport URUCHOMIENIA / OBSERWACJI MASZYNY — natywny tekst.
import {
  buildReportPdf, mediaCollector, buildLinkMaps, thumbDescriptors,
  assemblePackage, fileBase, downloadBlob, slugify,
  timeHHMM, formatDurationFull, formatDurationShort,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawStatCards,
  drawTable, drawTextBlock, drawThumbsRow, drawVideosTable, drawPhotoAppendix,
} from './core.js'

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  ;(report.stops || []).forEach((s, idx) => {
    const reason = s.reason === 'Inne' && s.customReason ? s.customReason : (s.reason || '')
    push(s.media, `Zatrzymanie #${idx + 1} — ${reason}`, `Zatrzymanie-${idx + 1}_${slugify(reason) || 'X'}`)
  })
  push(report.generalMedia, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  return finalize()
}

function buildPdf(ctx, report, photos, videos) {
  const h = report.header || {}
  const { photoMap } = buildLinkMaps(photos)
  const W = ctx.contentW
  const totalRunMs = report.sessionStartAt && report.sessionEndAt
    ? new Date(report.sessionEndAt) - new Date(report.sessionStartAt) : 0
  const totalStopMs = (report.stops || []).reduce((s, st) => s + (st.durationMs || 0), 0)
  const longest = (report.stops || []).reduce((m, st) => Math.max(m, st.durationMs || 0), 0)

  drawReportHeader(ctx, { title: 'RAPORT URUCHOMIENIA / OBSERWACJI MASZYNY', number: h.reportNumber })

  drawMetaTable(ctx, [
    [{ label: 'Projekt', value: h.projectName || '—' }, { label: 'Maszyna', value: h.machineName || '—' }, { label: 'Data', value: h.date || '—' }],
    [{ label: 'Autor', value: h.author || '—', colspan: 2 }, { label: 'Sesja', value: `${timeHHMM(report.sessionStartAt)} — ${timeHHMM(report.sessionEndAt)}` }],
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
        _thumbs: thumbDescriptors(s.media, photoMap),
      })),
      thumbsCol: 'komentarz', thumbsKey: '_thumbs',
    })
  }

  drawSectionHeader(ctx, 'Obserwacje ogólne')
  drawTextBlock(ctx, report.observations)

  drawSectionHeader(ctx, 'Wnioski i rekomendacje')
  drawTextBlock(ctx, report.conclusions)

  const generalThumbs = thumbDescriptors(report.generalMedia, photoMap)
  if (generalThumbs.length) {
    drawSectionHeader(ctx, 'Dokumentacja ogólna')
    drawThumbsRow(ctx, generalThumbs)
  }

  drawPhotoAppendix(ctx, photos)

  drawVideosTable(ctx, videos)
}

export async function generateCommissioningPdf(report) {
  const { r, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  downloadBlob(pdfBlob, fileBase(r) + '.pdf')
}

export async function generateCommissioningPackage(report) {
  const { r, photos, videos, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  const pack = await assemblePackage(pdfBlob, photos, videos, fileBase(r))
  downloadBlob(pack.blob, pack.filename)
}
