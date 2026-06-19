// Raport SERWISU NA OBIEKCIE — natywny tekst (jsPDF + autotable + Roboto).
// WZORZEC podejścia: nagłówek → meta-tabele → tabele z miniaturkami pod tekstem
// (klikalne do pełnego pliku w ZIP) + badge priorytetu → blok tekstu.
import {
  buildReportPdf, mediaCollector, buildLinkMaps, thumbDescriptors,
  assemblePackage, fileBase, downloadBlob, slugify,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawTable, drawTextBlock,
  drawEmpty, drawPhotoAppendix,
} from './core.js'

const PRIORITY_BADGE = {
  urgent: { text: 'Pilne', kind: 'rejected' },
  planned: { text: 'Planowe', kind: 'warning' },
  watch: { text: 'Obserwacja', kind: 'completed' },
}

const VISIT_STATUS_LABELS = {
  completed: 'Zakończono (maszyna działa)',
  followup: 'Wymaga spotkania / dalszych działań',
  parts: 'Maszyna zatrzymana',
}

function serviceVisitDuration(arrival, departure) {
  if (!arrival || !departure) return null
  const [ah, am] = String(arrival).split(':').map(Number)
  const [dh, dm] = String(departure).split(':').map(Number)
  if ([ah, am, dh, dm].some((n) => Number.isNaN(n))) return null
  let mins = (dh * 60 + dm) - (ah * 60 + am)
  if (mins < 0) mins += 24 * 60
  if (mins === 0) return null
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  return hh > 0 ? `${hh} h ${mm} min` : `${mm} min`
}

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  ;(report.actions || []).forEach((a, idx) => {
    const desc = a.description ? ' — ' + a.description.slice(0, 40) : ''
    push(a.media, `Czynność #${idx + 1}${desc}`, `Czynnosc-${idx + 1}`)
  })
  ;(report.parts || []).forEach((p, idx) => {
    push(p.media, `Element #${idx + 1}${p.name ? ' — ' + p.name : ''}`, `Element-${idx + 1}_${slugify(p.name) || 'X'}`)
  })
  ;(Array.isArray(report.observations) ? report.observations : []).forEach((o, idx) => {
    push(o.media, `Obserwacja #${idx + 1}`, `Obserwacja-${idx + 1}`)
  })
  return finalize()
}

function buildPdf(ctx, report, photos) {
  const h = report.header || {}
  const v = report.visit || {}
  const { photoMap } = buildLinkMaps(photos)
  const observations = Array.isArray(report.observations) ? report.observations : []
  const totalTime = serviceVisitDuration(v.arrival, v.departure)
  const W = ctx.contentW

  drawReportHeader(ctx, { title: 'RAPORT SERWISU NA OBIEKCIE', number: h.reportNumber })

  drawMetaTable(ctx, [
    [{ label: 'Projekt', value: h.projectName || '—' }, { label: 'Maszyna', value: h.machineName || '—' }, { label: 'Data', value: h.date || '—' }],
    [{ label: 'Autor', value: h.author || '—' }, { label: 'Rola', value: report.role || '—' }, { label: 'Status', value: VISIT_STATUS_LABELS[report.visitStatus] || '—' }],
  ])

  drawSectionHeader(ctx, 'A. Dane wizyty')
  drawMetaTable(ctx, [
    [{ label: 'Klient', value: v.client || '—' }, { label: 'Lokalizacja', value: v.location || '—' }],
    [{ label: 'Przyjazd', value: v.arrival || '—' }, { label: 'Odjazd', value: v.departure || '—' }, { label: 'Łączny czas', value: totalTime || '—' }],
    [{ label: 'Odbiór prac (kto odebrał)', value: report.receivedBy || '—', colspan: 3 }],
  ])

  drawSectionHeader(ctx, `B. Wykonane czynności (${(report.actions || []).length})`)
  if ((report.actions || []).length === 0) {
    drawEmpty(ctx, 'Brak wpisów.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Opis czynności', dataKey: 'opis', width: W - 12 },
      ],
      rows: report.actions.map((a, i) => ({ nr: i + 1, opis: a.description || '', _thumbs: thumbDescriptors(a.media, photoMap) })),
      thumbsCol: 'opis', thumbsKey: '_thumbs',
    })
  }

  drawSectionHeader(ctx, `C. Elementy do wymiany / uwagi (${(report.parts || []).length})`)
  if ((report.parts || []).length === 0) {
    drawEmpty(ctx, 'Brak wpisów.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Element', dataKey: 'name', width: 40 },
        { header: 'Nr katalogowy', dataKey: 'cat', width: 28 },
        { header: 'Priorytet', dataKey: 'prio', width: 24 },
        { header: 'Komentarz', dataKey: 'comment', width: W - 12 - 40 - 28 - 24 },
      ],
      rows: report.parts.map((p, i) => ({
        nr: i + 1, name: p.name || '—', cat: p.catalogNo || '—',
        prio: '', _prio: p.priority,
        comment: p.comment || '', _thumbs: thumbDescriptors(p.media, photoMap),
      })),
      badge: { col: 'prio', resolve: (r) => PRIORITY_BADGE[r._prio] },
      thumbsCol: 'comment', thumbsKey: '_thumbs',
    })
  }

  drawSectionHeader(ctx, `D. Obserwacje własne (${observations.length})`)
  if (observations.length === 0) {
    drawEmpty(ctx, 'Brak obserwacji.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Obserwacja', dataKey: 'text', width: W - 12 },
      ],
      rows: observations.map((o, i) => ({ nr: i + 1, text: o.text || '', _thumbs: thumbDescriptors(o.media, photoMap) })),
      thumbsCol: 'text', thumbsKey: '_thumbs',
    })
  }

  drawSectionHeader(ctx, 'E. Rekomendacje')
  drawTextBlock(ctx, report.recommendations)

  drawPhotoAppendix(ctx, photos)
}

const baseName = (r) => fileBase(r, 'serwis')

export async function generateServicePdf(report) {
  const { r, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  downloadBlob(pdfBlob, baseName(r) + '.pdf')
}

export async function generateServicePackage(report) {
  const { r, photos, videos, pdfBlob } = await buildReportPdf(report, collectMedia, buildPdf)
  const pack = await assemblePackage(pdfBlob, photos, videos, baseName(r))
  downloadBlob(pack.blob, pack.filename)
}
