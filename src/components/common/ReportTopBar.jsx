import AutoSaveIndicator from './AutoSaveIndicator.jsx'

// Górny pasek strony raportu: powrót, odrzucenie szkicu i wskaźnik zapisu.
// Wcześniej ten sam układ był przepisany w każdym z 6 typów raportów.
//
// „Odrzuć" celowo stoi TU, obok powrotu, a nie jako pływający przycisk nad
// formularzem: pływający guzik na telefonie zasłania pola i sam prosi się o
// przypadkowe tapnięcie — czyli o dokładnie ten problem, który naprawiamy.
// Wyjście z raportu ma jedno miejsce, więc nie trzeba go szukać.
//
// `children` → dodatkowa treść po prawej (np. faza sesji w uruchomieniu,
// znacznik FAT/SAT w odbiorze).
export default function ReportTopBar({ page, report, navigate, children }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm shrink-0">
          ← Strona główna
        </button>
        {report.status !== 'completed' && (
          <button
            onClick={() => page.discardDraft(navigate)}
            className="text-sm text-red-600 dark:text-red-400 hover:underline shrink-0"
            title="Usuń ten raport i wróć — nie zostanie w bazie"
          >
            🗑 Odrzuć
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 min-w-0">
        {children}
        <AutoSaveIndicator savedAt={page.savedAt} unsaved={page.unsaved} />
      </div>
    </div>
  )
}
