import { useMemo, useState } from 'react'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import LoadingOverlay from '../common/LoadingOverlay.jsx'
import PdfPreview from '../common/PdfPreview.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import SuggestInput from '../common/SuggestInput.jsx'
import { suggestProjectNumbers, suggestPartCatalogNos, suggestAuthors, suggestSuppliers } from '../../utils/suggestions.js'
import { getById, newId } from '../../utils/storage.js'
import { computeReportNumber } from '../../utils/reportNumber.js'
import { useReportPage } from '../../utils/useReportPage.js'
import { buildComplaintPackage, buildComplaintPdf } from '../../utils/pdfGenerator.js'
import { ensureValidOrConfirm } from '../../utils/validateReport.js'
import { shareFileOrDownload, downloadBlob, canShareFiles } from '../../utils/syncPackage.js'
import { BUYER_EMAIL_KEY, getDefaultAuthor } from '../../utils/settings.js'

// Zapisany e-mail zakupowca — jeden, globalny (ustawienia globalne #/settings).
// Pamiętany między zgłoszeniami w localStorage, edytowalny też w formularzu.
// Klucz `BUYER_EMAIL_KEY` współdzielony z utils/settings.js.

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
      author: getDefaultAuthor(),
    },
    partNo: '',
    supplier: '',        // v0.52 — bez dostawcy nie da się zrobić Pareto reklamacji
    defectCategory: '',
    blocksAssembly: false,
    description: '',
    media: [],
    buyerEmail: '',
  }
}

// `desktop=true` dorzuca przypomnienie o ręcznym załączeniu pobranej paczki
// (mailto nie potrafi załączać plików). Opis przycięty do 500 znaków, by
// nie przekroczyć limitu długości URL-a mailto (pełny opis i tak jest w PDF).
function buildEmailBody(report, desktop, filename) {
  const h = report.header || {}
  const lines = [
    `Zgłoszenie wady / reklamacja: ${h.reportNumber || ''}`,
    `Nr projektu: ${h.projectNumber || '—'}`,
    `Część: ${report.partNo || '—'}`,
    `Dostawca: ${report.supplier || '—'}`,
    `Kategoria wady: ${report.defectCategory || '—'}`,
    `Blokuje montaż: ${report.blocksAssembly ? 'TAK' : 'nie'}`,
    `Zgłaszający: ${h.author || '—'}`,
    '',
    `Opis: ${(report.description || '—').slice(0, 500)}`,
    '',
  ]
  if (desktop) {
    lines.push(`>>> Załącz pobraną paczkę: ${filename || 'reklamacja.zip'} (folder Pobrane) <<<`)
  } else {
    lines.push('Paczka ZIP (PDF + zdjęcia w pełnym rozmiarze) w załączniku.')
  }
  return lines.join('\n')
}

// Telefon vs komputer — decyduje o sposobie wysyłki.
// Telefon (Android/iOS, też iPadOS podszywający się pod Maca): Web Share → Outlook.
// Komputer: mailto (otwiera Outlook z adresatem+tematem) + pobranie ZIP do załączenia.
function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true // iPadOS 13+
  return false
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

  // Wspólny szkielet (auto-save, paczka ZIP, sync). Wysyłka do zakupowca jest
  // specyficzna dla reklamacji — zostaje lokalnie, z własnym stanem spinnera.
  const page = useReportPage({ report, setReport, buildPackage: buildComplaintPackage, buildPdf: buildComplaintPdf })
  const { toast, confirm } = page
  const [sendingBuyer, setSendingBuyer] = useState(false)
  const busy = page.downloading || page.sending || sendingBuyer
  const canShare = canShareFiles() // telefon → udostępnianie wprost; desktop → pobranie

  // Źródła autouzupełniania — memoizowane (jednorazowo na mount), zamiast
  // przeliczać cały localStorage przy każdym renderze/klawiszu.
  const projectNumberSug = useMemo(() => suggestProjectNumbers(), [])
  const partCatalogSug = useMemo(() => suggestPartCatalogNos(), [])
  const authorSug = useMemo(() => suggestAuthors(), [])
  const supplierSug = useMemo(() => suggestSuppliers(), [])

  // Pola nagłówka (lean) — projectNumber/date przeliczają numer raportu REK-...
  const setHeaderField = (k, v) => {
    setReport((r) => {
      const header = { ...r.header, [k]: v }
      header.reportNumber = computeReportNumber('REK', header.projectNumber, header.date, r.header.reportNumber)
      return { ...r, header }
    })
  }

  const setBuyerEmail = (v) => {
    setReport((r) => ({ ...r, buyerEmail: v }))
    try { localStorage.setItem(BUYER_EMAIL_KEY, v) } catch {}
  }

  // Wyślij do zakupowca — platformowo:
  //  • Komputer: pobiera paczkę ZIP (PDF + zdjęcia full-res) i otwiera Outlook
  //    przez mailto (adresat + temat + treść). Załącznik przeciąga się ręcznie
  //    z folderu Pobrane (mailto nie umie załączać plików).
  //  • Telefon: Web Share paczki ZIP → wybierasz Outlook, ZIP już załączony.
  //    Adres zakupowca kopiowany do schowka (Web Share nie prefilluje adresata).
  const sendToBuyer = async () => {
    if (!(await ensureValidOrConfirm(report, confirm))) return
    setSendingBuyer(true)
    try {
      const pack = await buildComplaintPackage(report) // { blob, filename }
      const subject = `REKLAMACJA ${report.header.reportNumber || ''}${report.partNo ? ` / ${report.partNo}` : ''}`.trim()
      if (report.buyerEmail) {
        try { await navigator.clipboard.writeText(report.buyerEmail) } catch {}
      }

      if (isMobileDevice()) {
        // Telefon → Outlook z załączoną paczką
        await shareFileOrDownload(pack.blob, pack.filename, 'application/zip', {
          title: subject,
          text: buildEmailBody(report, false),
        })
        toast.success(report.buyerEmail ? 'Gotowe — adres zakupowca w schowku' : 'Gotowe do wysłania')
      } else {
        // Komputer → pobierz ZIP + otwórz Outlook (mailto)
        downloadBlob(pack.blob, pack.filename)
        const body = buildEmailBody(report, true, pack.filename)
        const mailto = `mailto:${encodeURIComponent(report.buyerEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        const a = document.createElement('a')
        a.href = mailto
        document.body.appendChild(a)
        a.click()
        a.remove()
        toast.success('Outlook otwarty — załącz pobraną paczkę ZIP z folderu Pobrane')
      }
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setSendingBuyer(false)
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
        <AutoSaveIndicator savedAt={page.savedAt} />
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
              suggestions={projectNumberSug}
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
              suggestions={partCatalogSug}
              value={report.partNo}
              onChange={(e) => setReport((r) => ({ ...r, partNo: e.target.value }))} />
          </div>
          <div className="min-w-0">
            <label className="field-label">Dostawca</label>
            <SuggestInput type="text" className="field-input"
              placeholder="np. nazwa firmy"
              suggestions={supplierSug}
              value={report.supplier || ''}
              onChange={(e) => setReport((r) => ({ ...r, supplier: e.target.value }))} />
          </div>
          <div className="min-w-0">
            <label className="field-label field-required">Zgłaszający</label>
            <SuggestInput type="text" className="field-input"
              suggestions={authorSug}
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
          <strong>Na komputerze:</strong> „Wyślij" pobiera paczkę ZIP i otwiera Outlook
          z wpisanym adresem i tematem — przeciągnij pobrany plik z folderu Pobrane do maila.
          <br />
          <strong>Na telefonie:</strong> „Wyślij" otwiera Outlooka z już załączoną paczką;
          adres zakupowca kopiuje się do schowka (wklej w polu „Do").
        </p>
      </div>

      <LoadingOverlay visible={busy} />

      {/* Sticky action bar */}
      <div className="action-bar space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={page.openPreview}
            disabled={busy}
            className="btn-secondary flex-1"
            title="Zobacz gotowe zgłoszenie w aplikacji (bez pobierania)"
          >
            {page.previewing ? '⏳' : '👁 Podgląd'}
          </button>
          <button
            onClick={sendToBuyer}
            disabled={busy}
            className="btn-primary flex-[2] text-base"
          >
            {sendingBuyer ? '⏳ Przygotowanie…' : '📤 Wyślij do zakupowca'}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={page.downloadPdf}
            disabled={busy}
            className="btn-secondary flex-1"
            title="Zapisz PDF na dysku komputera / w Plikach telefonu"
          >
            {page.downloading ? '⏳' : '💾 Zapisz PDF'}
          </button>
          <button
            onClick={canShare ? page.sharePackage : page.downloadPackage}
            disabled={busy}
            className="btn-secondary flex-1"
            title="Pełna paczka ZIP (PDF + zdjęcia w pełnej rozdzielczości)"
          >
            {page.downloading ? '⏳' : (canShare ? '📦 Udostępnij ZIP' : '📦 Zapisz ZIP')}
          </button>
          <button onClick={() => navigate('')} className="btn-secondary flex-1">
            Zapisz i wyjdź
          </button>
        </div>
      </div>

      {page.preview && (
        <PdfPreview
          blob={page.preview.blob}
          filename={page.preview.filename}
          canShare={canShare}
          onShare={page.sharePdf}
          onDownload={page.downloadPdf}
          onClose={page.closePreview}
        />
      )}
    </div>
  )
}
