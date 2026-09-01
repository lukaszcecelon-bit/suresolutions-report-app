import { useState } from 'react'
import { useToast, useConfirm } from '../components/common/Toast.jsx'
import { useAutoSave } from './useAutoSave.js'
import { isBlankReport } from './reportFields.js'
import { remove, collectMediaIds } from './storage.js'
import { formatBytes } from './text.js'
import { TRANSFER_BUILDERS } from './pdfGenerator.js'
import { ensureValidOrConfirm } from './validateReport.js'
import { exportReportPackage, shareOrDownload, shareFileOrDownload, downloadBlob, makePackageFilename, canShareFiles } from './syncPackage.js'

// Wspólny szkielet strony raportu — wcześniej każdy z 5 typów raportów
// powielał ten sam zestaw: toast/confirm, stany downloading/sending,
// auto-save, finishReport, sendToDevice, downloadPdf. Teraz jedna
// implementacja; strony przekazują tylko swój generator paczki.
//
// Blokada ukończonych (F4): raport ze statusem 'completed' jest tylko do
// odczytu — strona owija sekcje w <fieldset disabled={page.locked}>, co
// natywnie wyłącza WSZYSTKIE inputy/przyciski w środku (też MediaUploader
// i uchwyty drag, bo wszystkie są <button>/<input>). „Odblokuj edycję"
// zdejmuje blokadę na czas tej wizyty na stronie (status zostaje completed).
// Pobieranie/wysyłka działają mimo blokady — pasek akcji jest poza fieldsetem.
export function useReportPage({ report, setReport, buildPackage, buildPdf }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [downloading, setDownloading] = useState(false)
  const [sending, setSending] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState(null) // { blob, filename } | null

  // Debounced auto-save (300ms idle) — keeps typing smooth without losing data
  const savedAt = useAutoSave(report)

  const locked = report.status === 'completed' && !unlocked

  // Szkic bez treści — jeszcze NIE ma go w bazie (patrz useAutoSave). Strona
  // pokazuje to zamiast mylącego „Zapisano".
  const unsaved = !savedAt && isBlankReport(report)

  // Wyjście ze świeżego raportu bez zostawiania po sobie wpisu. Pusty szkic
  // odrzucamy bez pytania (nie ma czego stracić); przy wpisanych danych pytamy.
  const discardDraft = async (navigate) => {
    if (!isBlankReport(report)) {
      if (!(await confirm('Odrzucić ten raport? Wpisane dane i zdjęcia zostaną usunięte. Tej operacji nie można cofnąć.', {
        title: 'Odrzuć raport', confirmLabel: 'Odrzuć', variant: 'danger',
      }))) return
    }
    remove(report.id)
    navigate('')
  }
  const unlock = () => {
    setUnlocked(true)
    toast.info('Edycja odblokowana — raport pozostaje oznaczony jako ukończony')
  }

  const finishReport = async () => {
    if (!(await confirm('Oznaczyć raport jako ukończony? Zostanie zablokowany do edycji (możesz odblokować), a pobieranie paczki będzie nadal możliwe.', {
      confirmLabel: 'Oznacz', title: 'Zakończenie raportu',
    }))) return
    setReport((r) => ({ ...r, status: 'completed' }))
    toast.success('Raport ukończony i zablokowany do edycji')
  }

  // Przeniesienie na inne urządzenie — od v1.4 zwykły PDF raportu z ZASZYTĄ
  // paczką danych (patrz pdfAttachment.js). Wcześniej wychodził osobny plik
  // `.suresync`: dwa różne pliki na to samo, nietypowe rozszerzenie blokowane
  // przez pocztę/Teams, a odbiorca samego PDF-a nie mógł go wczytać do edycji.
  // Fallback na starą paczkę zostaje dla typów spoza rejestru builderów.
  const sendToDevice = async (forceDownload = false) => {
    setSending(true)
    try {
      const buildTransfer = TRANSFER_BUILDERS[report.type]
      const { blob, filename } = buildTransfer
        ? await buildTransfer(report)
        : { blob: await exportReportPackage(report), filename: makePackageFilename(report) }
      // Rozmiar w komunikacie, bo to jest właśnie to, na czym wysyłka się
      // wykłada: skrzynki tną załączniki na 20 MB. Wideo zostaje na tym
      // urządzeniu (profil 'lite'), więc mówimy o tym wprost.
      const skippedVideos = collectMediaIds(report).videos.size
      const details = formatBytes(blob.size)
        + (skippedVideos > 0 ? ` · bez wideo (${skippedVideos}) — zostaje na tym urządzeniu` : '')

      if (forceDownload) {
        downloadBlob(blob, filename)
        // Na telefonie ten przycisk ma konkretny cel: dostarczyć plik do Plików,
        // bo udostępnianie Z PLIKÓW widzi Teams, a udostępnianie wprost z apki
        // już nie (rozszerzenie Teamsa na iOS bierze plik z dysku, nie z pamięci).
        toast.success(canShareFiles()
          ? `Zapisane w Plikach (${details}) — teraz udostępnij plik z aplikacji Pliki`
          : `PDF z danymi zapisany (${details}) — można go wczytać z powrotem do apki`)
      } else {
        await shareOrDownload(blob, filename)
        toast.success(`PDF z danymi gotowy do wysłania (${details})`)
      }
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setSending(false)
    }
  }

  // Wspólny przebieg: walidacja → spinner → builder zwraca { blob, filename } →
  // pobranie (downloadBlob) ALBO udostępnienie (Web Share → Teams/Mail).
  const runArtifact = async (builder, { share = false, mime, okMsg } = {}) => {
    if (!builder) return
    if (!(await ensureValidOrConfirm(report, confirm))) return
    setDownloading(true)
    try {
      const { blob, filename } = await builder(report)
      if (share) {
        const ok = await shareFileOrDownload(blob, filename, mime)
        // ok=false → użytkownik anulował systemowe okno; nie pokazujemy sukcesu.
        if (ok) toast.success('Udostępniono')
      } else {
        downloadBlob(blob, filename)
        toast.success(okMsg)
      }
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setDownloading(false)
    }
  }

  // Pobranie lokalne (desktop) — sam PDF lub pełna paczka ZIP.
  const downloadPdf = () => runArtifact(buildPdf || buildPackage, { mime: 'application/pdf', okMsg: 'PDF pobrany' })
  const downloadPackage = () => runArtifact(buildPackage, { mime: 'application/zip', okMsg: 'Paczka ZIP pobrana' })
  // Udostępnienie przez systemowe okno (telefon) — wprost do Teams/Maila,
  // bez okrężnej drogi „pobierz → Pliki → udostępnij".
  const sharePdf = () => runArtifact(buildPdf || buildPackage, { share: true, mime: 'application/pdf' })
  const sharePackage = () => runArtifact(buildPackage, { share: true, mime: 'application/zip' })

  // Wyślij mailem (desktop) — pobiera PDF i otwiera domyślny klient poczty
  // (Outlook) z tematem i treścią. Załącznik user przeciąga z Pobranych
  // (mailto nie potrafi załączać plików). Na telefonie od tego jest „Udostępnij".
  const emailReport = async () => {
    const builder = buildPdf || buildPackage
    if (!builder) return
    if (!(await ensureValidOrConfirm(report, confirm))) return
    setDownloading(true)
    try {
      const { blob, filename } = await builder(report)
      downloadBlob(blob, filename)
      const num = report.header?.reportNumber || 'raport'
      const subject = `Raport ${num}`
      const body = `Dzień dobry,\n\nw załączeniu raport ${num}.\n\n(Załącz pobrany plik „${filename}" z folderu Pobrane.)\n\nPozdrawiam`
      const a = document.createElement('a')
      a.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      toast.success('Poczta otwarta — załącz pobrany PDF z folderu Pobrane')
    } catch (e) {
      toast.error('Błąd: ' + (e.message || e))
    } finally {
      setDownloading(false)
    }
  }

  // Podgląd PDF w aplikacji — BEZ bramki walidacji (można podejrzeć też szkic).
  // Buduje ten sam PDF co wysyłka i przekazuje go do <PdfPreview>.
  const openPreview = async () => {
    const builder = buildPdf || buildPackage
    if (!builder) return
    setPreviewing(true)
    try {
      const artifact = await builder(report)
      setPreview(artifact)
    } catch (e) {
      toast.error('Błąd podglądu: ' + (e.message || e))
    } finally {
      setPreviewing(false)
    }
  }
  const closePreview = () => setPreview(null)

  return {
    toast, confirm, savedAt, unsaved, discardDraft,
    downloading, sending, previewing, preview,
    locked, unlock,
    finishReport, sendToDevice, downloadPdf, downloadPackage, sharePdf, sharePackage,
    emailReport, openPreview, closePreview,
  }
}
