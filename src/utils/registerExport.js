// Eksport REJESTRU LEKCJI PROJEKTOWYCH do XLSX (jeden wiersz = jedna lekcja).
// To jest odpowiedź na „kategoryzację": PDF to karta pojedynczej lekcji, a ten
// arkusz to filtrowalna baza — sortowanie/filtry/tabela przestawna w Excelu lub
// Power BI. SheetJS (xlsx) ładowany LENIWIE (ciężki) — dopiero przy eksporcie.
import { LESSON_SEVERITIES } from './settings.js'
import { reportClient } from './reportFields.js'

const SEV_LABEL = Object.fromEntries(LESSON_SEVERITIES.map((s) => [s.key, s.label]))

// Liczba zdjęć w lekcji (opis błędu + wnioski) — przydatna kolumna w rejestrze.
function countPhotos(report) {
  let n = (report.problemMedia || []).filter((m) => m?.kind === 'image').length
  for (const l of (report.lessons || [])) {
    n += (l.media || []).filter((m) => m?.kind === 'image').length
  }
  return n
}

// Kolejność i nagłówki kolumn arkusza. Klucz = nagłówek widoczny w Excelu.
const COLUMNS = [
  { key: 'Numer',         width: 20, get: (r) => r.header?.reportNumber || '' },
  { key: 'Data',          width: 11, get: (r) => r.header?.date || '' },
  { key: 'Nr projektu',   width: 12, get: (r) => r.header?.projectNumber || '' },
  { key: 'Projekt',       width: 22, get: (r) => r.header?.projectName || '' },
  { key: 'Klient',        width: 18, get: (r) => reportClient(r) },
  { key: 'Maszyna',       width: 20, get: (r) => r.header?.machineName || '' },
  { key: 'Nr rysunku',    width: 14, get: (r) => r.drawingNo || '' },
  { key: 'Etap wykrycia', width: 14, get: (r) => r.stage || '' },
  { key: 'Kategoria',     width: 18, get: (r) => r.category || '' },
  { key: 'Istotność',     width: 11, get: (r) => SEV_LABEL[r.severity] || '' },
  { key: 'Opis błędu',    width: 45, get: (r) => r.problem || '' },
  { key: 'Skutek',        width: 30, get: (r) => r.impact || '' },
  { key: 'Wnioski',       width: 45, get: (r) => (r.lessons || []).map((l) => l.text).filter(Boolean).join(' | ') },
  { key: 'Zdjęcia',       width: 8,  get: (r) => countPhotos(r) },
  { key: 'Autor',         width: 18, get: (r) => r.header?.author || '' },
  { key: 'Status',        width: 11, get: (r) => (r.status === 'completed' ? 'Ukończony' : 'Roboczy') },
]

// Buduje arkusz XLSX z listy raportów typu 'lesson'. Zwraca { blob, filename, count }.
// Rzuca wyjątkiem, gdy brak lekcji — caller pokazuje toast.
export async function buildLessonRegisterXlsx(reports) {
  const lessons = (reports || [])
    .filter((r) => r.type === 'lesson')
    .sort((a, b) => {
      const da = a.header?.date || (a.createdAt || '').slice(0, 10)
      const db = b.header?.date || (b.createdAt || '').slice(0, 10)
      return da < db ? 1 : da > db ? -1 : 0   // najnowsze na górze
    })

  if (lessons.length === 0) {
    const err = new Error('Brak lekcji projektowych do wyeksportowania')
    err.code = 'EMPTY'
    throw err
  }

  // Interop CJS/ESM: xlsx bywa udostępniany jako namespace ALBO pod .default.
  const mod = await import('xlsx')
  const XLSX = mod.utils ? mod : (mod.default || mod)
  const rows = lessons.map((r) => {
    const o = {}
    for (const c of COLUMNS) o[c.key] = c.get(r)
    return o
  })

  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS.map((c) => c.key) })
  ws['!cols'] = COLUMNS.map((c) => ({ wch: c.width }))
  // Autofiltr na całym zakresie — od razu klikalne filtry w Excelu.
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lekcje projektowe')

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const date = new Date().toISOString().slice(0, 10)
  return { blob, filename: `rejestr-lekcji_${date}.xlsx`, count: lessons.length }
}
