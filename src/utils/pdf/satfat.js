// Raport ODBIORU SAT / FAT — natywny tekst (najbogatszy typ).
import {
  makeReportGenerators, mediaCollector, thumbDescriptors,
  fileBase, slugify,
  drawReportHeader, drawMetaTable, drawSectionHeader, drawSubLabel, drawStatCards,
  drawTable, drawTextBlock, drawThumbsRow, drawSignatures, drawBadge,
  drawVideosTable, drawEmpty, drawPhotoAppendix,
} from './core.js'
import { durationBetweenLabel } from '../time.js'
import { reportClient, reportLocation } from '../reportFields.js'

const TITLES = { fat: 'RAPORT ODBIORU FABRYCZNEGO (FAT)', sat: 'RAPORT ODBIORU NA OBIEKCIE (SAT)' }

const TEST_BADGE = {
  pass: { text: 'Zaliczony', kind: 'completed' },
  fail: { text: 'Niezaliczony', kind: 'rejected' },
  conditional: { text: 'Warunkowo', kind: 'warning' },
  na: { text: 'N/A', kind: 'neutral' },
}
const TEST_STATUS_SLUGS = { pass: 'PASS', fail: 'FAIL', conditional: 'COND', na: 'NA' }

const PUNCH_BADGE = {
  critical: { text: 'Krytyczne', kind: 'rejected' },
  major: { text: 'Istotne', kind: 'warning' },
  minor: { text: 'Drobne', kind: 'completed' },
}
const PUNCH_SLUGS = { critical: 'KRYT', major: 'IST', minor: 'DROB' }

const FINAL_BADGE = {
  accepted: { text: 'Zaakceptowano', kind: 'completed' },
  conditional: { text: 'Zaakceptowano warunkowo', kind: 'warning' },
  rejected: { text: 'Odrzucono', kind: 'rejected' },
}

function collectMedia(report) {
  const { push, finalize } = mediaCollector()
  ;(report.tests || []).forEach((t, idx) => {
    const desc = t.description ? ' — ' + t.description.slice(0, 50) : ''
    const ctxLabel = `Test #${idx + 1}${desc} (${TEST_BADGE[t.status]?.text || ''})`
    const descSlug = t.description ? '_' + slugify(t.description) : ''
    push(t.media, ctxLabel, `Test-${idx + 1}_${TEST_STATUS_SLUGS[t.status] || 'X'}${descSlug}`)
  })
  ;(report.punchlist || []).forEach((p, idx) => {
    const desc = p.description ? ' — ' + p.description.slice(0, 50) : ''
    const ctxLabel = `Usterka #${idx + 1}${desc} (${PUNCH_BADGE[p.priority]?.text || ''})`
    const descSlug = p.description ? '_' + slugify(p.description) : ''
    push(p.media, ctxLabel, `Usterka-${idx + 1}_${PUNCH_SLUGS[p.priority] || 'X'}${descSlug}`)
  })
  ;(Array.isArray(report.conclusions) ? report.conclusions : []).forEach((o, idx) => {
    push(o.media, `Wniosek #${idx + 1}`, `Wniosek-${idx + 1}`)
  })
  push(report.media, 'Dokumentacja ogólna', 'Dokumentacja-ogolna')
  return finalize()
}

// Sekcja wniosków jako lista rekordów {text, media} — spójnie z serwisem/uruchomieniem.
function notesSection(ctx, records) {
  const list = Array.isArray(records) ? records : []
  if (!list.length) { drawEmpty(ctx, 'Brak wpisów.'); return }
  drawTable(ctx, {
    columns: [
      { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
      { header: 'Wniosek / komentarz', dataKey: 'text', width: ctx.contentW - 12 },
    ],
    rows: list.map((o, i) => ({ nr: i + 1, text: o.text || '', _thumbs: thumbDescriptors(o.media) })),
    thumbsCol: 'text', thumbsKey: '_thumbs',
  })
}

function participantsTable(ctx, list) {
  if (!list || list.length === 0) { drawEmpty(ctx, 'Nie podano osób.'); return }
  drawTable(ctx, {
    columns: [
      { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
      { header: 'Imię i nazwisko', dataKey: 'name', width: 90 },
      { header: 'Funkcja / stanowisko', dataKey: 'role', width: ctx.contentW - 12 - 90 },
    ],
    rows: list.map((p, i) => ({ nr: i + 1, name: p.name || '—', role: p.role || '—' })),
  })
}

function buildPdf(ctx, report, photos, videos) {
  const h = report.header || {}
  const info = report.info || {}
  const sigs = report.signatures || {}
  const W = ctx.contentW
  const title = TITLES[report.testType === 'sat' ? 'sat' : 'fat']
  const finalBadge = FINAL_BADGE[report.finalStatus] || { text: '—', kind: 'neutral' }

  const passCount = (report.tests || []).filter((t) => t.status === 'pass').length
  const failCount = (report.tests || []).filter((t) => t.status === 'fail').length
  const condCount = (report.tests || []).filter((t) => t.status === 'conditional').length
  const naCount = (report.tests || []).filter((t) => t.status === 'na').length

  drawReportHeader(ctx, { title, number: h.reportNumber })

  drawMetaTable(ctx, [
    [{ label: 'Projekt', value: h.projectName || '—' }, { label: 'Maszyna', value: h.machineName || '—' }, { label: 'Data', value: h.date || '—' }],
    [
      { label: 'Autor', value: h.author || '—' },
      { label: 'Typ odbioru', value: report.testType === 'sat' ? 'SAT (na obiekcie)' : 'FAT (u producenta)' },
      { label: 'Status', badge: finalBadge },
    ],
  ])

  drawSectionHeader(ctx, 'A. Kontekst odbioru')
  drawMetaTable(ctx, [
    [{ label: 'Klient', value: reportClient(report) || '—' }, { label: 'Lokalizacja', value: reportLocation(report) || '—' }],
    [
      { label: 'Godziny odbioru', value: [info.startTime, info.endTime].filter(Boolean).join(' – ') || '—' },
      { label: 'Czas odbioru', value: durationBetweenLabel(info.startTime, info.endTime) || '—' },
    ],
    [{ label: 'Dokument referencyjny', value: info.referenceDoc || '—', colspan: 2 }],
  ])

  drawSectionHeader(ctx, 'B. Uczestnicy odbioru')
  drawSubLabel(ctx, 'Strona klienta')
  participantsTable(ctx, report.participants?.client)
  drawSubLabel(ctx, 'Strona wykonawcy (SureSolutions)')
  participantsTable(ctx, report.participants?.vendor)

  drawSectionHeader(ctx, 'C. Testy odbiorowe')
  drawStatCards(ctx, [
    { label: 'Wszystkie', value: report.tests?.length || 0 },
    { label: 'Zaliczone', value: passCount },
    { label: 'Warunkowo', value: condCount },
    { label: 'Niezaliczone', value: failCount },
  ])
  if (naCount > 0) drawTextBlock(ctx, `Pominięte (N/A): ${naCount}`)
  if ((report.tests || []).length === 0) {
    drawEmpty(ctx, 'Brak zdefiniowanych testów.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Opis testu / co testowane', dataKey: 'opis', width: 50 },
        { header: 'Kryterium akceptacji', dataKey: 'krit', width: 40 },
        { header: 'Wynik', dataKey: 'wynik', width: 24, align: 'center' },
        { header: 'Uwagi', dataKey: 'uwagi', width: W - 12 - 50 - 40 - 24 },
      ],
      rows: report.tests.map((t, i) => ({
        nr: i + 1, opis: t.description || '—', krit: t.criterion || '—',
        wynik: '', _wynik: t.status, uwagi: t.notes || '', _thumbs: thumbDescriptors(t.media),
      })),
      badge: { col: 'wynik', resolve: (r) => TEST_BADGE[r._wynik] },
      thumbsCol: 'uwagi', thumbsKey: '_thumbs',
    })
  }

  drawSectionHeader(ctx, `D. Lista usterek (punchlist) (${report.punchlist?.length || 0})`)
  if ((report.punchlist || []).length === 0) {
    drawEmpty(ctx, 'Brak usterek — wszystko OK.')
  } else {
    drawTable(ctx, {
      columns: [
        { header: 'Nr', dataKey: 'nr', width: 12, align: 'center' },
        { header: 'Priorytet', dataKey: 'prio', width: 24, align: 'center' },
        { header: 'Opis usterki', dataKey: 'opis', width: 70 },
        { header: 'Uwagi', dataKey: 'uwagi', width: W - 12 - 24 - 70 },
      ],
      rows: report.punchlist.map((p, i) => ({
        nr: i + 1, prio: '', _prio: p.priority, opis: p.description || '—',
        uwagi: p.notes || '', _thumbs: thumbDescriptors(p.media),
      })),
      badge: { col: 'prio', resolve: (r) => PUNCH_BADGE[r._prio] },
      thumbsCol: 'uwagi', thumbsKey: '_thumbs',
    })
  }

  drawSectionHeader(ctx, 'E. Status końcowy odbioru')
  drawBadge(ctx, finalBadge.text, finalBadge.kind, true)

  const conclusions = Array.isArray(report.conclusions) ? report.conclusions : []
  drawSectionHeader(ctx, `F. Wnioski i komentarze (${conclusions.length})`)
  notesSection(ctx, conclusions)

  drawSectionHeader(ctx, 'G. Podpisy stron', 32)
  drawSignatures(ctx,
    { label: 'Strona klienta', name: sigs.clientName, date: sigs.clientDate },
    { label: 'Strona wykonawcy', name: sigs.vendorName, date: sigs.vendorDate },
  )

  const generalThumbs = thumbDescriptors(report.media)
  if (generalThumbs.length) {
    drawSectionHeader(ctx, 'H. Dokumentacja fotograficzna (ogólna)')
    drawThumbsRow(ctx, generalThumbs)
  }

  drawPhotoAppendix(ctx, photos)

  drawVideosTable(ctx, videos)
}

// Numer raportu zawiera już prefiks FAT-/SAT- i datę → używamy go wprost.
const gen = makeReportGenerators(collectMedia, buildPdf, (r) => fileBase(r, 'odbior'))
export const buildSatFatPdf = gen.pdf
export const buildSatFatPackage = gen.pkg
