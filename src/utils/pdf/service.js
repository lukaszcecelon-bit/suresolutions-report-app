// Raport SERWISU NA OBIEKCIE — natywny tekst (jsPDF + autotable + Roboto).
// WZORZEC podejścia: nagłówek → meta-tabele → tabele z miniaturkami pod tekstem
// (klikalne do pełnego pliku w ZIP) + badge priorytetu → blok tekstu.
import {
  makeReportGenerators, mediaCollector, thumbDescriptors,
  fileBase, slugify,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawTable,
  drawEmpty, drawPhotoAppendix,
} from './core.js'
import { durationBetweenLabel } from '../time.js'
import { reportClient, reportLocation } from '../reportFields.js'

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
  ;(Array.isArray(report.recommendations) ? report.recommendations : []).forEach((o, idx) => {
    push(o.media, `Rekomendacja #${idx + 1}`, `Rekomendacja-${idx + 1}`)
  })
  return finalize()
}

function buildPdf(ctx, report, photos) {
  const h = report.header || {}
  const v = report.visit || {}
  const observations = Array.isArray(report.observations) ? report.observations : []
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : []
  const totalTime = durationBetweenLabel(v.arrival, v.departure)
  const W = ctx.contentW

  drawReportHeader(ctx, { title: 'RAPORT SERWISU NA OBIEKCIE', number: h.reportNumber })

  drawMetaTable(ctx, [
    [{ label: 'Projekt', value: h.projectName || '—' }, { label: 'Maszyna', value: h.machineName || '—' }, { label: 'Data', value: h.date || '—' }],
    [{ label: 'Autor', value: h.author || '—' }, { label: 'Rola', value: report.role || '—' }, { label: 'Status', value: VISIT_STATUS_LABELS[report.visitStatus] || '—' }],
  ])

  drawSectionHeader(ctx, 'A. Dane wizyty')
  drawMetaTable(ctx, [
    [{ label: 'Klient', value: reportClient(report) || '—' }, { label: 'Lokalizacja', value: reportLocation(report) || '—' }, { label: 'Osoby obecne', value: v.attendees ? String(v.attendees) : '—' }],
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
      rows: report.actions.map((a, i) => ({ nr: i + 1, opis: a.description || '', _thumbs: thumbDescriptors(a.media) })),
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
        { header: 'Element', dataKey: 'name', width: 38 },
        { header: 'Nr katalogowy', dataKey: 'cat', width: 26 },
        { header: 'Szt.', dataKey: 'qty', width: 12, align: 'center' },
        { header: 'Priorytet', dataKey: 'prio', width: 24 },
        { header: 'Komentarz', dataKey: 'comment', width: W - 12 - 38 - 26 - 12 - 24 },
      ],
      rows: report.parts.map((p, i) => ({
        nr: i + 1, name: p.name || '—', cat: p.catalogNo || '—',
        qty: (p.qty ?? '') === '' ? '—' : String(p.qty),
        prio: '', _prio: p.priority,
        comment: p.comment || '', _thumbs: thumbDescriptors(p.media),
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
      rows: observations.map((o, i) => ({ nr: i + 1, text: o.text || '', _thumbs: thumbDescriptors(o.media) })),
      thumbsCol: 'text', thumbsKey: '_thumbs',
    })
  }

  drawSectionHeader(ctx, `E. Rekomendacje (${recommendations.length})`)
  if (recommendations.length === 0) {
    drawEmpty(ctx, 'Brak rekomendacji.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Rekomendacja', dataKey: 'text', width: W - 12 },
      ],
      rows: recommendations.map((o, i) => ({ nr: i + 1, text: o.text || '', _thumbs: thumbDescriptors(o.media) })),
      thumbsCol: 'text', thumbsKey: '_thumbs',
    })
  }

  drawPhotoAppendix(ctx, photos)
}

const baseName = (r) => fileBase(r, 'serwis')
const gen = makeReportGenerators(collectMedia, buildPdf, baseName)
export const buildServicePdf = gen.pdf
export const buildServicePackage = gen.pkg
