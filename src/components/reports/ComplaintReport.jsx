import { useState } from 'react'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import LoadingOverlay from '../common/LoadingOverlay.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import SuggestInput from '../common/SuggestInput.jsx'
import { useToast, useConfirm } from '../common/Toast.jsx'
import { suggestProjectNumbers, suggestPartCatalogNos, suggestAuthors } from '../../utils/suggestions.js'
import { getById, newId } from '../../utils/storage.js'
import { useAutoSave } from '../../utils/useAutoSave.js'
import { generateComplaintPackage, generateComplaintPdfBlob } from '../../utils/pdfGenerator.js'
import { ensureValidOrConfirm } from '../../utils/validateReport.js'
import { exportReportPackage, shareOrDownload, shareFileOrDownload, downloadBlob, makePackageFilename } from '../../utils/syncPackage.js'

// Zapisany e-mail zakupowca — jeden, globalny (ustawienia). Pamiętany między
// zgłoszeniami w localStorage, edytowalny w formularzu.
const BUYER_EMAIL_KEY = 'suresolutions.buyerEmail'

const DEFECT_CATEGORIES = [
  'Wymiary / otwory', 'Materiał', 'Obróbka / powierzchnia',
  'Brak elementu', 'Uszkodzenie', 'Niezgodność z dokumentacją', 'Inne',
]
const DEFECT_ITEMS = DEFECT_CATEGORIES.map((c) => ({ key: c, label: c }))

const BLOCKER_ITEMS = [
  { key: 'yes', label: 'Blokuje montaż', icon: '⛔', activeClass: 'bg-red-600 text-white border-transparent font-semibold' },
  { key: 'no',  label: 'Nie blokuje',    icon: '✓',  activeClass: 'bg-emerald-600 text-white border-transparent' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()

function computeReportNumber(projectNumber, date) {
  const pn = (projectNumber || '').trim()
  if (!pn) return ''
  return `REK-${pn}-${date || ''}`
}

function defaultReport() {
  return {
    id: newId(),
    type: 'complaint',
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    header: {
      projectNumber: '',
      reportNumber: '',   // auto: REK-{projectNumber}-{date}
      date: todayISO(),
      author: '',
    },
    partNo: '',
    defectCategory: '',
    blocksAssembly: false,
    description: '',
    media: [],
    buyerEmail: '',
  }
}

function buildEmailBody(report) {
  const h = report.header || {}
  return [
    `Zgłoszenie wady / reklamacja: ${h.reportNumber || ''}`,
    `Nr projektu: ${h.projectNumber || '—'}`,
    `Część: ${report.partNo || '—'}`,
    `Kategoria wady: ${report.defectCategory || '—'}`,
    `Blokuje montaż: ${report.blocksAssembly ? 'TAK' : 'nie'}`,
    `Zgłaszający: ${h.author || '—'}`,
    '',
    `Opis: ${report.description || '—'}`,
    '',
    'PDF ze zdjęciem/zdjęciami w załączniku.',
  ].join('\n')
}

export default function ComplaintReport({ navigate, reportId }) {
  const [report, setReport] = useState(() => {
    if (reportId) {
      const existing = getById(reportId)
      if (existing) return existing
    }
    const def = defaultReport()
    try { def.buyerEmail = localStorage.getItem(BUYER_EMAIL_KEY) || '' } catch {}
    return def
  })

  const toast = useToast()
  const confirm = useConfirm()
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)

  const savedAt = useAutoSave(report)

  // Pola nagłówka (lean) — projectNumber/date przeliczają numer raportu REK-...
  const setHeaderField = (k, v) => {
    setReport((r) => {
      const header = { ...r.header, [k]: v }
      header.reportNumber = computeReportNumber(header.projectNumber, header.date)
      return { ...r, header }
    })
  }

  const setBuyerEmail = (v) => {
    setReport((r) => ({ ...r, buyerEmail: v }))
    try { localStorage.setItem(BUYER_EMAIL_KEY, v) } catch {}
  }

  // Wyślij do zakupowca: generuj PDF → Web Share (Outlook/Mail z załącznikiem).
  // E-mail zakupowca kopiowany do schowka dla wygody (Web Share nie prefilluje
  // adresata niezawodnie).
  const sendToBuyer = async () => {
    if (!(await ensureValidOrConfirm(report, confirm))) return
    setSending(true)
    try {
      const blob = await generateComplaintPdfBlob(report)
      const filename = `${(report.header.reportNumber || 'reklamacja').replace(/[^\w\-]+/g, '_')}.pdf`
      if (report.buyerEmail) {
        try { await navigator.clipboard.writeText(report.buyerEmail) } catch {}
      }
      const subject = `REKLAMACJA ${report.header.reportNumber || ''}${report.partNo ? ` / ${report.partNo}` : ''}`.trim()
      await shareFileOrDownload(blob, filename, 'application/pdf', { title: subject, text: buildEmailBody(report) })
      toast.success(report.buyerEmail ? 'Gotowe — adres zakupowca skopiowany' : 'Gotowe do wysłania')
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setSending(false)
    }
  }

  const downloadPackage = async () => {
    if (!(await ensureValidOrConfirm(report, confirm))) return
    setDownloading(true)
    try {
      await generateComplaintPackage(report)
      toast.success('Paczka pobrana')
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setDownloading(false)
    }
  }

  const sendToDevice = async (forceDownload = false) => {
    setSending(true)
    try {
      const blob = await exportReportPackage(report)
      const filename = makePackageFilename(report)
      if (forceDownload) {
        downloadBlob(blob, filename)
        toast.success('Plik zapisany lokalnie')
      } else {
        await shareOrDownload(blob, filename)
        toast.success('Paczka gotowa do przesłania')
      }
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setSending(false)
    }
  }

  const copyEmail = async () => {
    if (!report.buyerEmail) return
    try {
      await navigator.clipboard.writeText(report.buyerEmail)
      toast.success('Adres skopiowany')
    } catch {
      toast.error('Nie udało się skopiować')
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <AutoSaveIndicator savedAt={savedAt} />
      </div>

      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <span className="text-base">🚩</span>
        <span className="font-medium">Reklamacja / zgłoszenie wady</span>
      </div>

      {/* Zdjęcie najpierw — to najważniejszy element zgłoszenia */}
      <div id="sec-photos" className="card">
        <h3 className="section-title">Zdjęcie wady</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Zrób zdjęcie i zaznacz wadę (tapnij miniaturę → ✎ adnotacje, np. strzałka na źle wykonane otwory).
        </p>
        <MediaUploader
          photoOnly
          media={report.media}
          onChange={(m) => setReport((r) => ({ ...r, media: m }))}
        />
      </div>

      {/* Identyfikacja */}
      <div id="sec-ident" className="card">
        <h3 className="section-title">Identyfikacja</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="field-label field-required">Numer projektu</label>
            <SuggestInput type="text" className="field-input"
              placeholder="np. 2025-104"
              suggestions={suggestProjectNumbers()}
              value={report.header.projectNumber}
              onChange={(e) => setHeaderField('projectNumber', e.target.value)} />
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Nr zgłoszenia: <span className="font-mono text-sure-dark dark:text-gray-200">{report.header.reportNumber || '—'}</span>
            </div>
          </div>
          <div className="min-w-0">
            <label className="field-label field-required">Numer / nazwa części</label>
            <SuggestInput type="text" className="field-input"
              placeholder="np. nr katalogowy lub nazwa"
              suggestions={suggestPartCatalogNos()}
              value={report.partNo}
              onChange={(e) => setReport((r) => ({ ...r, partNo: e.target.value }))} />
          </div>
          <div className="min-w-0">
            <label className="field-label field-required">Zgłaszający</label>
            <SuggestInput type="text" className="field-input"
              suggestions={suggestAuthors()}
              value={report.header.author}
              onChange={(e) => setHeaderField('author', e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Data</label>
            <input type="date" className="field-input"
              value={report.header.date}
              onChange={(e) => setHeaderField('date', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Wada */}
      <div id="sec-defect" className="card">
        <h3 className="section-title">Opis wady</h3>
        <label className="field-label">Kategoria wady</label>
        <ToggleGroup
          size="sm"
          items={DEFECT_ITEMS}
          value={report.defectCategory}
          onChange={(k) => setReport((r) => ({ ...r, defectCategory: k }))}
        />
        <div className="mt-3">
          <label className="field-label">Pilność</label>
          <ToggleGroup
            items={BLOCKER_ITEMS}
            value={report.blocksAssembly ? 'yes' : 'no'}
            onChange={(k) => setReport((r) => ({ ...r, blocksAssembly: k === 'yes' }))}
          />
        </div>
        <div className="mt-3">
          <label className="field-label">Opis (co dokładnie jest nie tak)</label>
          <MicTextarea
            placeholder="np. otwory montażowe przesunięte o ~3 mm względem rysunku, nie pasują do elementu współpracującego…"
            value={report.description}
            onChange={(e) => setReport((r) => ({ ...r, description: e.target.value }))}
          />
        </div>
      </div>

      {/* Wysyłka */}
      <div id="sec-send" className="card">
        <h3 className="section-title">Wysyłka do zakupowca</h3>
        <label className="field-label">E-mail zakupowca (zapamiętany)</label>
        <div className="flex gap-2">
          <input
            type="email"
            inputMode="email"
            className="field-input flex-1 min-w-0"
            placeholder="zakupowiec@firma.pl"
            value={report.buyerEmail || ''}
            onChange={(e) => setBuyerEmail(e.target.value)}
          />
          <button
            onClick={copyEmail}
            disabled={!report.buyerEmail}
            className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 shrink-0 disabled:opacity-40"
            title="Skopiuj adres do schowka"
          >📋 Kopiuj</button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          „Wyślij" otwiera systemowe menu z gotowym PDF i tematem. Adres zakupowca
          kopiuje się do schowka — wklej go w polu „Do" (Outlook zapamięta na przyszłość).
        </p>
      </div>

      <LoadingOverlay visible={downloading || sending} />

      {/* Sticky action bar */}
      <div className="action-bar">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={sendToBuyer}
            disabled={sending || downloading}
            className="btn-primary flex-[2] text-base"
          >
            {sending ? '⏳ Przygotowanie…' : '📤 Wyślij do zakupowca'}
          </button>
          <button
            onClick={downloadPackage}
            disabled={downloading || sending}
            className="btn-secondary flex-1"
            title="Pełna paczka ZIP (PDF + zdjęcia w pełnej rozdzielczości)"
          >
            {downloading ? '⏳' : '📦 Paczka ZIP'}
          </button>
          <button
            onClick={() => sendToDevice(true)}
            disabled={sending || downloading}
            className="btn-secondary flex-1"
            title="Zapisz paczkę na inne urządzenie"
          >
            💾 Zapisz plik
          </button>
          <button onClick={() => navigate('')} className="btn-secondary flex-1">
            Zapisz i wyjdź
          </button>
        </div>
      </div>
    </div>
  )
}
