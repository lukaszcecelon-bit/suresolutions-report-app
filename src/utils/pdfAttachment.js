import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'

// ZASZYWANIE PACZKI DANYCH W PDF-ie (v1.4) — jeden plik zamiast dwóch.
//
// Po co: przenoszenie raportu między urządzeniami wymagało osobnej paczki
// `.suresync`. To dawało dwa różne pliki na to samo („który mam wysłać?"), a
// nietypowe rozszerzenie bywa blokowane przez pocztę i Teams. Gorsze było to, że
// gdy monter wysłał sam PDF, odbiorca NIE MÓGŁ go wczytać do edycji — musiał
// prosić o wygenerowanie ZIP-a, czyli o kolejną rundę w terenie.
//
// Rozwiązanie: PDF niesie paczkę w środku, jako standardowy załącznik PDF
// (EmbeddedFiles — ten sam mechanizm, którym e-faktury wożą XML w wydruku).
// Na wydruku nie widać nic; dla apki to komplet danych. Wysyłasz jeden plik,
// który jest RAZEM dokumentem do czytania i źródłem do edycji.
//
// Zapis: jsPDF nie ma API do załączników, ale wystawia niskopoziomowe
// `newObject`/`out` i zdarzenia `postPutResources`/`putCatalog` — obiekty
// dopisujemy ręcznie (zasoby lecą przed katalogiem, więc w katalogu można się do
// nich odwołać).
// Odczyt: pdf.js `getAttachments()` — pdf.js i tak jest w apce (podgląd PDF).

// Uint8Array → „binary string" (jeden znak = jeden bajt). Tak jsPDF trzyma dane
// obrazów, a przy zapisie robi charCodeAt & 0xFF, więc bajty przechodzą bez
// zmian. Porcjami po 8 KB — apply() na kilkumegabajtowej tablicy przepełnia stos.
function bytesToBinaryString(bytes) {
  const CHUNK = 8192
  let out = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return out
}

// Escape dla łańcucha w składni PDF: ( ) i \ mają znaczenie strukturalne.
const escPdfString = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

export function attachFileToPdf(doc, { filename, bytes, mime = 'application/zip', description = '' }) {
  const internal = doc.internal
  const binary = bytesToBinaryString(bytes)
  let namesId = null

  internal.events.subscribe('postPutResources', () => {
    const streamId = internal.newObject()
    internal.out('<<')
    internal.out('/Type /EmbeddedFile')
    // Nazwa typu MIME w składni PDF — ukośnik jako #2F.
    internal.out('/Subtype /' + mime.replace(/\//g, '#2F'))
    internal.out('/Length ' + binary.length)
    internal.out('>>')
    internal.out('stream')
    internal.out(binary)
    internal.out('endstream')
    internal.out('endobj')

    const fileSpecId = internal.newObject()
    internal.out(
      '<</Type /Filespec /F (' + escPdfString(filename) + ') /UF (' + escPdfString(filename) + ')' +
      ' /Desc (' + escPdfString(description) + ') /EF <</F ' + streamId + ' 0 R>>>>'
    )
    internal.out('endobj')

    namesId = internal.newObject()
    internal.out('<</Names [(' + escPdfString(filename) + ') ' + fileSpecId + ' 0 R]>>')
    internal.out('endobj')
  })

  internal.events.subscribe('putCatalog', () => {
    if (namesId !== null) internal.out('/Names <</EmbeddedFiles ' + namesId + ' 0 R>>')
  })
}

// Czy plik jest PDF-em (sygnatura %PDF-), a nie paczką ZIP.
export async function isPdfFile(file) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  return String.fromCharCode(...head) === '%PDF-'
}

// Wyciąga zaszytą paczkę z PDF-a i zwraca ją jako File (gotowy dla readPackage).
// null = PDF bez danych (np. wydrukowany albo przepuszczony przez narzędzie,
// które załączniki wycina) — caller pokazuje wtedy zrozumiały komunikat.
export async function extractPackageFromPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const doc = await pdfjsLib.getDocument({ data }).promise
  try {
    const attachments = await doc.getAttachments()
    if (!attachments) return null
    const entries = Object.values(attachments)
    const pick = entries.find((a) => /\.suresync$/i.test(a.filename || '')) || entries[0]
    if (!pick?.content) return null
    return new File([pick.content], pick.filename || 'dane.suresync', { type: 'application/zip' })
  } finally {
    doc.destroy?.()
  }
}
