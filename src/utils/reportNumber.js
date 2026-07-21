// Jedna, wspólna reguła numeru raportu: {PREFIX}-{nr projektu}-{data}.
// Wcześniej 6 komponentów raportów miało niemal identyczne kopie
// `computeReportNumber`, a prefiksy były zaszyte jeszcze raz w storage.cloneReport.
//
// prevNumber: gdy numer projektu jest pusty, ZACHOWUJEMY dotychczasowy numer
// (ręczny / ze starych raportów sprzed auto-numeracji) zamiast go kasować.
// Wcześniej serwis i lekcja kasowały ręczny numer przy pustym projekcie —
// gryzło to najstarsze raporty serwisowe. Uruchomienie/prototyp/SAT-FAT miały
// ten guard; teraz wszystkie typy działają tak samo.
export function computeReportNumber(prefix, projectNumber, date, prevNumber = '') {
  const pn = (projectNumber || '').trim()
  if (!pn) return prevNumber || ''
  return `${prefix}-${pn}-${date || ''}`
}
