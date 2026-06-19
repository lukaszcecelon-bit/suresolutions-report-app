import LoadingOverlay from './LoadingOverlay.jsx'

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
  return (
    <>
      <LoadingOverlay visible={page.downloading} />

      <div className="action-bar space-y-2">
        {/* Gotowy raport do wysyłki — osobno PDF (otwierany od razu) i ZIP. */}
        <div className="flex flex-col sm:flex-row gap-2">
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
            title="Udostępnij paczkę przez systemowe menu (AirDrop/Mail/OneDrive)"
          >
            {page.sending ? '⏳' : '📤 Wyślij'}
          </button>
          <button
            onClick={() => page.sendToDevice(true)}
            disabled={page.sending}
            className="btn-secondary flex-1"
            title="Zapisz paczkę jako plik na inne urządzenie (do Pobranych/Files)"
          >
            {page.sending ? '⏳' : '💾 Zapisz na urządzenie'}
          </button>
          <button onClick={() => navigate('')} className="btn-secondary flex-1">
            Zapisz i wyjdź
          </button>
        </div>
      </div>
    </>
  )
}
