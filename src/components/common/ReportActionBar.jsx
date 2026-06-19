import LoadingOverlay from './LoadingOverlay.jsx'
import PdfPreview from './PdfPreview.jsx'
import { canShareFiles } from '../../utils/syncPackage.js'

// Baner blokady ukończonego raportu (F4). Renderowany NAD treścią strony,
// poza <fieldset disabled> — przycisk „Odblokuj" musi być klikalny.
export function LockBanner({ locked, onUnlock }) {
  if (!locked) return null
  return (
    <div className="rounded-lg border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 flex items-center justify-between gap-3">
      <div className="text-sm text-emerald-800 dark:text-emerald-200">
        🔒 <strong>Raport ukończony</strong> — zablokowany do edycji.
        Pobieranie i wysyłka działają normalnie.
      </div>
      <button onClick={onUnlock} className="btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 shrink-0">
        ✏️ Odblokuj edycję
      </button>
    </div>
  )
}

// Wspólny pasek akcji stron raportów + overlay generowania.
// `page` to wynik useReportPage(). showFinish=false dla typów bez przycisku
// „Oznacz ukończony" (uruchomienie — tam kończy się SESJĘ, nie raport).
export default function ReportActionBar({ page, status, navigate, showFinish = true }) {
  // Telefon (iOS/Android) → systemowe okno udostępniania wprost do Teams/Maila.
  // Desktop → klasyczne pobranie pliku.
  const canShare = canShareFiles()
  return (
    <>
      <LoadingOverlay visible={page.downloading} />

      <div className="action-bar space-y-2">
        {/* Gotowy raport do wysyłki — podgląd w apce + osobno PDF i ZIP. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={page.openPreview}
            disabled={page.previewing || page.downloading}
            className="btn-secondary flex-1 text-base"
            title="Zobacz gotowy raport w aplikacji (bez pobierania)"
          >
            {page.previewing ? '⏳ Przygotowanie…' : '👁 Podgląd'}
          </button>
          {canShare ? (
            <>
              <button
                onClick={page.sharePdf}
                disabled={page.downloading}
                className="btn-primary flex-[2] text-base"
                title="Udostępnij sam PDF wprost do Teams / Maila / Plików"
              >
                {page.downloading ? '⏳ Generowanie…' : '📲 Udostępnij PDF'}
              </button>
              <button
                onClick={page.sharePackage}
                disabled={page.downloading}
                className="btn-secondary flex-1 text-base"
                title="Udostępnij paczkę ZIP (PDF + zdjęcia w pełnej rozdzielczości)"
              >
                {page.downloading ? '⏳' : '📦 Udostępnij ZIP'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={page.downloadPdf}
                disabled={page.downloading}
                className="btn-primary flex-[2] text-base"
                title="Sam plik PDF — odbiorca otwiera bezpośrednio, bez rozpakowywania"
              >
                {page.downloading ? '⏳ Generowanie…' : '📄 Pobierz PDF'}
              </button>
              <button
                onClick={page.downloadPackage}
                disabled={page.downloading}
                className="btn-secondary flex-1 text-base"
                title="Paczka ZIP: PDF + wszystkie zdjęcia i wideo w pełnej rozdzielczości"
              >
                {page.downloading ? '⏳' : '📦 ZIP (PDF + zdjęcia)'}
              </button>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          {showFinish && status !== 'completed' && (
            <button onClick={page.finishReport} className="btn-success flex-1">
              ✓ Oznacz ukończony
            </button>
          )}
          <button
            onClick={() => page.sendToDevice(false)}
            disabled={page.sending}
            className="btn-secondary flex-1"
            title="Paczka do PRZENIESIENIA raportu na inne Twoje urządzenie (z możliwością edycji po imporcie)"
          >
            {page.sending ? '⏳' : '🔄 Przenieś na inne urządzenie'}
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
    </>
  )
}
