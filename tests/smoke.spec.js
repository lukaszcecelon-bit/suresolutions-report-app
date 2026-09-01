import { test, expect } from 'playwright/test'
import { PDFParse } from 'pdf-parse'
import fs from 'node:fs/promises'
import sharp from 'sharp'

// Smoke test krytycznej ścieżki: apka się ładuje → raport tworzy się i zapisuje
// → paczka PDF generuje się i zawiera PRAWDZIWY, kopiowalny tekst (nie obraz),
// z poprawnymi polskimi znakami. Strzeże celu migracji PDF→tekst natywny
// (jsPDF + osadzony font Roboto) przed regresją zanim trafi na produkcję.

test.beforeEach(async ({ page }) => {
  // Onboarding-tour zasłania UI przy pierwszej wizycie — wyłącz przed startem.
  // Web Share wyłączamy, żeby pasek akcji pokazał przyciski „Pobierz" (a nie
  // „Udostępnij") — w headless i tak nie da się przejść systemowego okna share.
  await page.addInitScript(() => {
    try { localStorage.setItem('suresolutions.onboarding.v2.dismissed', '1') } catch {}
    try { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }) } catch {}
    try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) } catch {}
  })
})

test('strona główna się ładuje', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Nowy raport/ })).toBeVisible()
})

test('raport serwisowy: PDF z natywnym, kopiowalnym tekstem + polskie znaki', async ({ page }) => {
  await page.goto('/#/service')

  // Pierwsze pole = numer projektu; generuje numer raportu RPT-99-998-...
  await page.locator('input.field-input').first().fill('99-998')
  await page.waitForTimeout(800) // autosave (debounce 300 ms)

  // Generowanie: raport niekompletny → modal walidacji → realny download.
  // „Pobierz PDF" daje sam plik PDF (od v0.33 osobno od paczki ZIP).
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Zapisz PDF/ }).click()
  await page.getByRole('button', { name: 'Pobierz mimo to' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.pdf$/)

  // Wyciągnij tekst z PDF — dowód, że to tekst, a nie obraz.
  const path = await download.path()
  const buf = await fs.readFile(path)
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  const data = await parser.getText()
  await parser.destroy()

  // 1) PDF ma wyekstrahowalny tekst (raster dałby pusty wynik).
  expect(data.text.replace(/\s/g, '').length).toBeGreaterThan(20)
  // 2) Tytuł raportu obecny jako TEKST.
  expect(data.text).toContain('RAPORT SERWISU NA OBIEKCIE')
  // 3) Polskie znaki diakrytyczne przetrwały (font Roboto + mapa ToUnicode) —
  //    "CZYNNOŚCI" (Ś) i "WŁASNE" (Ł) jako dowód poprawnego kopiowania po polsku.
  expect(data.text).toContain('CZYNNOŚCI')
  expect(data.text).toMatch(/[ĄĆĘŁŃÓŚŻŹ]/)
})

test('osobny PDF vs ZIP + załącznik dużych zdjęć (v0.33)', async ({ page }) => {
  // Realny JPEG (sharp) → dataURL wstrzyknięty wprost do mediów raportu.
  // Ustawiony dataUrl zwalnia resolveReportPhotos z sięgania do IndexedDB,
  // więc raport z fotką da się zaseedować samym localStorage.
  const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 110, b: 180 } } })
    .jpeg().toBuffer()
  const dataUrl = 'data:image/jpeg;base64,' + jpg.toString('base64')

  const report = {
    id: 'r_test_pdf', type: 'service', status: 'draft', schemaVersion: 1,
    createdAt: '2026-06-19T08:00:00.000Z', updatedAt: '2026-06-19T08:00:00.000Z',
    header: { reportNumber: 'RPT-99-996-2026-06-19', projectName: 'Projekt 99-996', machineName: 'Maszyna X', date: '2026-06-19', author: 'Jan Testowy' },
    visit: { client: 'Klient', location: 'Hala 1', arrival: '08:00', departure: '10:00', travelKm: '128' },
    role: 'serwisant', visitStatus: 'completed',
    actions: [{ id: 'a1', description: 'Wymiana czujnika', media: [{ id: 'm1', kind: 'image', photoId: 'p1', dataUrl }] }],
    parts: [], observations: [], recommendations: 'Zalecana kontrola za miesiąc', receivedBy: 'Klient',
  }

  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, report)

  await page.goto('/#/service/r_test_pdf')
  await page.waitForTimeout(400)

  // --- 1) „Pobierz PDF" → SAM plik .pdf (nie .zip) z załącznikiem zdjęć ---
  const dlPdf = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Zapisz PDF/ }).click()
  const skip1 = page.getByRole('button', { name: 'Pobierz mimo to' })
  if (await skip1.isVisible().catch(() => false)) await skip1.click()
  const pdf = await dlPdf
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/)

  const pdfBuf = await fs.readFile(await pdf.path())
  const parser = new PDFParse({ data: new Uint8Array(pdfBuf) })
  const pdfData = await parser.getText()
  await parser.destroy()
  // Załącznik fotograficzny obecny jako tekst + podpis zdjęcia z kontekstem.
  expect(pdfData.text).toContain('ZAŁĄCZNIK')
  expect(pdfData.text).toMatch(/Zdjęcie 1/)
  // Kilometry dojazdu w tabeli wizyty (v0.53) — 4. komórka wiersza z godzinami.
  expect(pdfData.text).toContain('DOJAZD')
  expect(pdfData.text).toMatch(/128\s*km/)
  // Plik PDF realnie zawiera osadzony obraz (duże zdjęcie zwiększa rozmiar).
  expect(pdfBuf.length).toBeGreaterThan(15_000)

  // --- 2) „ZIP (PDF + zdjęcia)" → archiwum .zip ---
  const dlZip = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Zapisz ZIP/ }).click()
  const skip2 = page.getByRole('button', { name: 'Pobierz mimo to' })
  if (await skip2.isVisible().catch(() => false)) await skip2.click()
  const zip = await dlZip
  expect(zip.suggestedFilename()).toMatch(/\.zip$/)
})

test('ticket z montażu: PDF karty + eksport rejestru do XLSX (v0.40, nazwy v1.3)', async ({ page }) => {
  // Ticket z kompletem wymaganych pól (opis + kategoria + ≥1 wniosek) — bez
  // modala walidacji. Seed przez localStorage; brak mediów = brak IndexedDB.
  const report = {
    id: 'r_lesson_test', type: 'lesson', status: 'draft', schemaVersion: 3,
    createdAt: '2026-06-19T08:00:00.000Z', updatedAt: '2026-06-19T08:00:00.000Z',
    header: { reportNumber: 'LL-99-990-2026-06-19', projectNumber: '99-990', projectName: 'Projekt', machineName: 'Podajnik', date: '2026-06-19', author: 'Jan' },
    partNos: [{ id: 'pn1', no: '25-104-03' }, { id: 'pn2', no: '25-104-07' }],
    drawingNo: 'RYS-1', stage: 'Uruchomienie', category: 'Dobór komponentu', severity: 'critical',
    problem: 'Zbyt mały prześwit prowadnicy — detal się blokuje.', problemMedia: [],
    impact: 'Przestój 2h, przeróbka.',
    lessons: [{ id: 'l1', text: 'Zwiększyć prześwit o 0,5 mm.', media: [] }],
  }
  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, report)

  // --- 1) Karta PDF lekcji: natywny tekst + polskie znaki ---
  await page.goto('/#/lesson/r_lesson_test')
  await page.waitForTimeout(400)
  const dlPdf = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Zapisz PDF/ }).click()
  const skip = page.getByRole('button', { name: 'Pobierz mimo to' })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  const pdf = await dlPdf
  expect(pdf.suggestedFilename()).toMatch(/LL-99-990.*\.pdf$/)

  const pdfBuf = await fs.readFile(await pdf.path())
  const parser = new PDFParse({ data: new Uint8Array(pdfBuf) })
  const pdfData = await parser.getText()
  await parser.destroy()
  expect(pdfData.text).toContain('LL-99-990')
  expect(pdfData.text).toContain('TICKET Z MONTAŻU')   // nowy tytuł (v1.3)
  expect(pdfData.text).toContain('25-104-03')          // numery części w nagłówku
  expect(pdfData.text).not.toContain('MASZYNA')        // chudy nagłówek — bez maszyny
  expect(pdfData.text).toMatch(/[ĄĆĘŁŃÓŚŻŹ]/)        // polskie znaki (BŁĘDU)

  // --- 2) Eksport REJESTRU ticketów do XLSX z zakładki Raporty (v0.42) ---
  // Od v0.51 narzędzia archiwum (import/backup/rejestr) są w menu ⋯ w nagłówku,
  // żeby nie zajmowały stałych wierszy nad listą raportów.
  await page.goto('/#/reports')
  await page.getByRole('button', { name: 'Narzędzia archiwum' }).click()
  const dlXlsx = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('menuitem', { name: /Rejestr ticketów/ }).click()
  const xlsx = await dlXlsx
  expect(xlsx.suggestedFilename()).toMatch(/rejestr-ticketow.*\.xlsx$/)
  // XLSX to archiwum ZIP — sygnatura „PK" na starcie pliku.
  const xlsxBuf = await fs.readFile(await xlsx.path())
  expect(xlsxBuf.subarray(0, 2).toString('latin1')).toBe('PK')
})

test('eksport analityczny: XLSX z zakładkami + JSONL z wyliczonymi miarami (v0.52)', async ({ page }) => {
  // Serwis SPECJALNIE w starym schemacie (v1, klient w `visit`) — sprawdza przy
  // okazji migrację v3→v4, która przenosi klienta/lokalizację do `header`.
  const service = {
    id: 'r_an_service', type: 'service', status: 'completed', schemaVersion: 1,
    createdAt: '2026-06-19T06:00:00.000Z', updatedAt: '2026-06-19T06:00:00.000Z',
    header: { reportNumber: 'RPT-99-981-2026-06-19', projectNumber: '99-981', projectName: 'Projekt', machineName: 'Prasa', date: '2026-06-19', author: 'Jan' },
    visit: { client: 'BSH', location: 'Hala 1', arrival: '08:00', departure: '10:30', attendees: '2', travelKm: '128' },
    role: 'Technik serwisu', visitStatus: 'completed',
    actions: [{ id: 'a1', description: 'Wymiana czujnika', media: [] }],
    parts: [
      { id: 'p1', name: 'Czujnik', catalogNo: 'ABC-1', qty: '2', priority: 'urgent', comment: '', media: [] },
      { id: 'p2', name: 'Pasek', catalogNo: 'DEF-2', qty: '3', priority: 'planned', comment: '', media: [] },
    ],
    observations: [], recommendations: [], receivedBy: 'Klient',
  }
  // Uruchomienie z dwoma zatrzymaniami: sesja 120 min, przestój 6+3 = 9 min →
  // dostępność 92.5%, MTTR 4.5, MTBF 60. Drugie zatrzymanie ma powód „Inne",
  // więc weryfikuje też rozdzielenie Powód / powod_slownik.
  const commissioning = {
    id: 'r_an_comm', type: 'commissioning', status: 'completed', schemaVersion: 3,
    createdAt: '2026-06-19T07:00:00.000Z', updatedAt: '2026-06-19T07:00:00.000Z',
    header: { reportNumber: 'URU-99-980-2026-06-19', projectNumber: '99-980', projectName: 'Projekt', machineName: 'Linia A', date: '2026-06-19', author: 'Jan', client: 'BSH' },
    phase: 'summary',
    sessionStartAt: '2026-06-19T08:00:00.000Z', sessionEndAt: '2026-06-19T10:00:00.000Z',
    activeStop: null,
    stops: [
      { id: 's1', startAt: '2026-06-19T08:30:00.000Z', endAt: '2026-06-19T08:36:00.000Z', durationMs: 360_000, reason: 'Zacięcie detalu', customReason: '', comment: 'zablokowany detal', media: [] },
      { id: 's2', startAt: '2026-06-19T09:00:00.000Z', endAt: '2026-06-19T09:03:00.000Z', durationMs: 180_000, reason: 'Inne', customReason: 'Brak powietrza', comment: '', media: [] },
    ],
    observations: [], conclusions: [], generalMedia: [],
  }
  await page.addInitScript((rs) => {
    for (const r of rs) {
      try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
    }
  }, [service, commissioning])

  await page.goto('/#/reports')

  // --- 1) XLSX: właściwe zakładki (gwiazda: fakty + dzieci) ---
  const dlXlsx = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Narzędzia archiwum' }).click()
  await page.getByRole('menuitem', { name: /Eksport analityczny.*Excel/ }).click()
  const xlsx = await dlXlsx
  expect(xlsx.suggestedFilename()).toMatch(/analiza-raportow.*\.xlsx$/)
  const xlsxBuf = await fs.readFile(await xlsx.path())
  const XLSX = await import('xlsx')
  const wb = XLSX.read(xlsxBuf, { type: 'buffer' })
  expect(wb.SheetNames).toContain('Info')
  expect(wb.SheetNames).toContain('Raporty')
  expect(wb.SheetNames).toContain('Zatrzymania')
  expect(wb.SheetNames).toContain('Części')

  // --- 2) JSONL: 1 linia = 1 raport, z policzonymi miarami i dziećmi ---
  const dlJson = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: 'Narzędzia archiwum' }).click()
  await page.getByRole('menuitem', { name: /Eksport analityczny.*JSONL/ }).click()
  const jsonl = await dlJson
  expect(jsonl.suggestedFilename()).toMatch(/analiza-raportow.*\.jsonl$/)
  const text = await fs.readFile(await jsonl.path(), 'utf8')
  const rows = text.trim().split('\n').map((l) => JSON.parse(l))
  expect(rows).toHaveLength(2)

  const comm = rows.find((r) => r.report_id === 'r_an_comm')
  expect(comm.czas_min).toBe(120)
  expect(comm.zatrzymania_min).toBe(9)
  expect(comm.dostepnosc_pct).toBe(92.5)
  expect(comm.mttr_min).toBe(4.5)
  expect(comm.mtbf_min).toBe(60)
  expect(comm.zatrzymania).toHaveLength(2)
  // „Inne" → w kolumnie Powód wpisany tekst, w słownikowej surowa wartość.
  expect(comm.zatrzymania[1].powod).toBe('Brak powietrza')
  expect(comm.zatrzymania[1].powod_slownik).toBe('Inne')
  expect(comm.zatrzymania[0].czas_s).toBe(360)

  const srv = rows.find((r) => r.report_id === 'r_an_service')
  expect(srv.klient).toBe('BSH')          // migracja v3→v4 przeniosła z visit → header
  expect(srv.lokalizacja).toBe('Hala 1')
  expect(srv.czas_min).toBe(150)          // 08:00 → 10:30
  expect(srv.czesci_szt).toBe(5)          // 2 + 3 sztuki
  expect(srv.czesci_pilne).toBe(1)
  expect(srv.czesci).toHaveLength(2)
  expect(srv.dojazd_km).toBe(128)         // liczba, nie „128 km" (v0.53)
  // Kolumny nie dotyczące typu muszą być PUSTE, nie zerowe (inaczej średnie kłamią).
  expect(srv.dostepnosc_pct).toBe('')
  expect(comm.czesci_szt).toBe('')
  expect(comm.dojazd_km).toBe('')
})

test('uruchomienie: powrót do zatrzymanej maszyny daje wznowienie + tryb ręczny (v1.0)', async ({ page }) => {
  // Raport porzucony w trakcie ZATRZYMANIA — dokładnie stan z terenu: telefon
  // przeładował PWA, inżynier wrócił do raportu i utknął na czerwonym ekranie
  // bez przycisku wznowienia (modal siedział w nieutrwalonym stanie Reacta).
  const stuck = {
    id: 'r_stuck', type: 'commissioning', status: 'draft', schemaVersion: 4,
    createdAt: '2026-08-18T05:00:00.000Z', updatedAt: '2026-08-18T05:00:00.000Z',
    header: { reportNumber: 'URU-25-201-2026-08-18', projectNumber: '25-201', projectName: 'Linia', machineName: 'Wtryskarka', date: '2026-08-18', author: 'Jan' },
    phase: 'stopped',
    sessionStartAt: '2026-08-18T05:35:00.000Z', sessionEndAt: null,
    activeStop: { startAt: '2026-08-18T10:45:00.000Z' },   // stary kształt: sama godzina
    stops: [], observations: [], conclusions: [], generalMedia: [],
  }
  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, stuck)

  await page.goto('/#/commissioning/r_stuck')

  // Modal odtwarza się z danych raportu → maszynę da się wznowić.
  const resume = page.getByRole('button', { name: /Zapisz i wznów/ })
  await expect(resume).toBeVisible()
  await resume.click()
  await expect(page.getByText(/Log zatrzymań \(1\)/)).toBeVisible()

  // --- tryb ręczny: kafelek w fazie 1 → godziny sesji wpisywane z ręki ---
  // reload, bo sama zmiana hasha nie przemontowuje komponentu raportu (stan
  // poprzedniego raportu zostałby w pamięci).
  await page.goto('/#/commissioning')
  await page.reload()
  await page.getByRole('button', { name: /Wypełnij ręcznie/ }).click()
  await page.getByRole('button', { name: 'Wypełniam ręcznie' }).click()

  await page.locator('#sess-date').fill('2026-08-20')
  await page.locator('#sess-start').fill('08:00')
  await page.locator('#sess-end').fill('16:30')
  // Statystyka liczy się z wpisanych godzin (8 h 30 min pracy) — wartość jest
  // i w kaflu podsumowania, i pod polami godzin, stąd .first().
  await expect(page.getByText('08:30:00').first()).toBeVisible()

  // Godzina wcześniejsza od startu NIE dosuwa doby (v1.1) — ostrzega.
  await page.locator('#sess-end').fill('07:00')
  await expect(page.getByText(/Zakończenie jest wcześniejsze/)).toBeVisible()
  await page.locator('#sess-end').fill('16:30')

  // …a zatrzymania dopisuje się ręcznie także w podsumowaniu.
  await page.getByRole('button', { name: /Dodaj zatrzymanie ręcznie/ }).click()
  await expect(page.getByText('Edytuj zatrzymanie')).toBeVisible()
})

test('uruchomienie ręczne: jeden dzień — koniec sesji nie ucieka o dobę (v1.1)', async ({ page }) => {
  // Raport zapisany przez v1.0 z koniecem sesji dosuniętym o dobę: 07:25 →
  // 14:50 następnego dnia dawało „31:25:00" zamiast „07:25:00" (zgłoszone ze
  // zrzutu ekranu). Otwarcie raportu ma to naprawić samo.
  const drifted = {
    id: 'r_drift', type: 'commissioning', status: 'draft', schemaVersion: 4,
    createdAt: '2026-08-20T05:00:00.000Z', updatedAt: '2026-08-20T05:00:00.000Z',
    header: { reportNumber: 'URU-25-201-2026-08-20', projectNumber: '25-201', projectName: 'Linia', machineName: 'Wtryskarka', date: '2026-08-20', author: 'Jan' },
    phase: 'finished', manual: true,
    sessionStartAt: new Date('2026-08-20T07:25:00').toISOString(),
    sessionEndAt: new Date('2026-08-21T14:50:00').toISOString(),   // ← doba w plecy
    activeStop: null, stops: [], observations: [], conclusions: [], generalMedia: [],
  }
  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, drifted)

  await page.goto('/#/commissioning/r_drift')

  await expect(page.getByText('07:25:00').first()).toBeVisible()
  await expect(page.getByText('31:25:00')).toHaveCount(0)
  // Data jest widoczna i edytowalna — bez niej rozjazdu nie dało się zauważyć.
  await expect(page.locator('#sess-date')).toHaveValue('2026-08-20')
})

test('nowy raport nie ląduje w bazie przed pierwszym wpisem + „Odrzuć" (v1.2)', async ({ page }) => {
  const count = () => page.evaluate(
    () => Object.keys(localStorage).filter((k) => k.startsWith('suresolutions.report.v2:')).length,
  )

  await page.goto('/#/service')

  // Przypadkowe tapnięcie w przełącznik statusu — zero wpisanej treści.
  // Przedtem wystarczyło to, żeby pusty raport osiadł w bazie na stałe.
  await page.getByRole('button', { name: /Wymaga spotkania/ }).click()
  await expect(page.getByText('Szkic — nie zapisany')).toBeVisible()
  await page.waitForTimeout(600)          // dłużej niż debounce auto-save
  expect(await count()).toBe(0)

  // Pierwszy realny wpis (numer projektu) → raport zapisuje się normalnie.
  await page.locator('input.field-input').first().fill('99-777')
  await expect(page.getByText(/Zapisano/)).toBeVisible()
  await expect.poll(count).toBe(1)

  // „Odrzuć" usuwa raport z bazy i wraca na Start (przy wpisanych danych pyta).
  await page.getByRole('button', { name: '🗑 Odrzuć' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Odrzuć' }).click()
  await expect.poll(count).toBe(0)
  await expect(page.getByRole('button', { name: /Nowy raport/ })).toBeVisible()
})

test('PDF z zaszytymi danymi: przenieś → wczytaj z powrotem (v1.4)', async ({ page }) => {
  // Pełna pętla przenoszenia raportu JEDNYM plikiem: „Przenieś na inne
  // urządzenie" daje PDF z zaszytą paczką, a import tego samego PDF-a odtwarza
  // raport. Wcześniej wychodził osobny .suresync i sam PDF nie dawał się wczytać.
  const report = {
    id: 'r_transfer', type: 'service', status: 'draft', schemaVersion: 4,
    createdAt: '2026-08-24T08:00:00.000Z', updatedAt: '2026-08-24T08:00:00.000Z',
    header: { reportNumber: 'RPT-99-321-2026-08-24', projectNumber: '99-321', projectName: 'Projekt transferowy', machineName: 'Prasa', date: '2026-08-24', author: 'Jan', client: 'BSH', location: 'Hala 3' },
    visit: { arrival: '08:00', departure: '12:00', attendees: '2', travelKm: '128' },
    role: 'Technik serwisu', visitStatus: 'completed',
    actions: [{ id: 'a1', description: 'Wymiana czujnika krańcowego', media: [] }],
    parts: [], observations: [], recommendations: [], receivedBy: 'Klient',
  }
  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, report)

  // --- 1) Eksport: PDF (nie .suresync) ---
  await page.goto('/#/service/r_transfer')
  const dl = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Przenieś na inne urządzenie/ }).click()
  const file = await dl
  expect(file.suggestedFilename()).toMatch(/\.pdf$/)
  const pdfPath = await file.path()

  // Plik jest prawdziwym PDF-em z czytelnym tekstem — czyli nadal dokumentem.
  const buf = await fs.readFile(pdfPath)
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  const pdfData = await parser.getText()
  await parser.destroy()
  expect(pdfData.text).toContain('RAPORT SERWISU NA OBIEKCIE')

  // --- 2) Kasujemy raport lokalnie (symulacja drugiego urządzenia) ---
  await page.goto('/#/reports')
  await page.evaluate(() => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('suresolutions.report.v2:'))
      .forEach((k) => localStorage.removeItem(k))
  })
  await page.reload()

  // --- 3) Import TEGO SAMEGO PDF-a odtwarza raport ---
  await page.locator('input[type="file"]').setInputFiles(pdfPath)
  await expect(page.getByRole('button', { name: 'Importuj' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Importuj' }).click()

  await expect.poll(async () => page.evaluate(() => {
    const raw = localStorage.getItem('suresolutions.report.v2:r_transfer')
    return raw ? JSON.parse(raw).header.projectName : null
  }), { timeout: 30_000 }).toBe('Projekt transferowy')

  // Dane szczegółowe też przeżyły podróż przez PDF.
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('suresolutions.report.v2:r_transfer')))
  expect(restored.visit.travelKm).toBe('128')
  expect(restored.actions[0].description).toBe('Wymiana czujnika krańcowego')
})

test('udostępnianie: plik ogłaszany jako PDF, bez dodatkowego tekstu (v1.5)', async ({ page }) => {
  // Regresja z terenu: na iPhonie w oknie udostępniania nie było Teams. Powód —
  // „Przenieś na inne urządzenie" ogłaszało PDF jako `application/zip`, a iOS
  // dobiera aplikacje po TYPIE pliku, nie po rozszerzeniu w nazwie.
  await page.addInitScript(() => {
    window.__shared = null
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: (data) => {
        const f = data.files && data.files[0]
        window.__shared = { name: f && f.name, type: f && f.type, keys: Object.keys(data).sort() }
        return Promise.resolve()
      },
      configurable: true,
    })
  })

  const report = {
    id: 'r_share', type: 'service', status: 'draft', schemaVersion: 4,
    createdAt: '2026-08-31T08:00:00.000Z', updatedAt: '2026-08-31T08:00:00.000Z',
    header: { reportNumber: 'RPT-99-555-2026-08-31', projectNumber: '99-555', projectName: 'Projekt', machineName: 'Prasa', date: '2026-08-31', author: 'Jan', client: 'Klient', location: 'Hala' },
    visit: { arrival: '08:00', departure: '12:00', attendees: '1', travelKm: '10' },
    role: 'Technik serwisu', visitStatus: 'completed',
    actions: [{ id: 'a1', description: 'Czynność', media: [] }],
    parts: [], observations: [], recommendations: [], receivedBy: 'Klient',
  }
  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, report)

  await page.goto('/#/service/r_share')

  // --- 1) zwykłe udostępnienie raportu ---
  await page.getByRole('button', { name: /Udostępnij PDF/ }).click()
  await expect.poll(() => page.evaluate(() => window.__shared?.type), { timeout: 60_000 })
    .toBe('application/pdf')
  const plain = await page.evaluate(() => window.__shared)
  expect(plain.name).toMatch(/\.pdf$/)
  expect(plain.keys).toEqual(['files'])   // bez title/text — inaczej iOS filtruje aplikacje

  // --- 2) przeniesienie na inne urządzenie (PDF z zaszytymi danymi) ---
  await page.evaluate(() => { window.__shared = null })
  await page.getByRole('button', { name: /Przenieś na inne urządzenie/ }).click()
  await expect.poll(() => page.evaluate(() => window.__shared?.type), { timeout: 60_000 })
    .toBe('application/pdf')
  const transfer = await page.evaluate(() => window.__shared)
  expect(transfer.name).toMatch(/\.pdf$/)
  expect(transfer.keys).toEqual(['files'])
})

test('plik do przenoszenia jest lekki mimo dużych zdjęć (v1.6)', async ({ page, browser }) => {
  // Regresja z terenu: „raporty do przenoszenia mają często powyżej 20 MB",
  // a skrzynki tną załączniki na 20 MB. Paczka zaszyta w PDF-ie niosła
  // PEŁNOWYMIAROWE oryginały zdjęć — choć sam PDF renderuje je w 1200×900.
  // Od v1.6 idzie profil 'lite': zdjęcia w rozdzielczości raportu, bez wideo.
  //
  // Szum, nie jednolity kolor — gładkie tło kompresuje się do kilku kB i test
  // przechodziłby także ze zepsutą poprawką.
  const bigPhoto = await sharp({
    create: {
      width: 3200, height: 2400, channels: 3,
      background: { r: 40, g: 90, b: 150 },
      noise: { type: 'gaussian', mean: 128, sigma: 70 },
    },
  }).jpeg({ quality: 92 }).toBuffer()
  expect(bigPhoto.length).toBeGreaterThan(1_000_000)   // realny plik z aparatu

  const report = {
    id: 'r_size', type: 'service', status: 'draft', schemaVersion: 4,
    createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z',
    header: { reportNumber: 'RPT-99-777-2026-09-01', projectNumber: '99-777', projectName: 'Projekt', machineName: 'Prasa', date: '2026-09-01', author: 'Jan', client: 'Klient', location: 'Hala' },
    visit: { arrival: '08:00', departure: '12:00', attendees: '1', travelKm: '10' },
    role: 'Technik serwisu', visitStatus: 'completed',
    actions: [{ id: 'a1', description: 'Czynność ze zdjęciem', media: [] }],
    parts: [], observations: [], recommendations: [], receivedBy: 'Klient',
  }
  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, report)

  await page.goto('/#/service/r_size')

  // Wgranie zdjęcia przez uploader — oryginał ląduje w IndexedDB (tej ścieżki
  // nie da się ominąć podstawianiem dataUrl w raporcie, a to właśnie oryginał
  // decyduje o wadze paczki).
  await page.locator('input[type="file"][multiple]').first().setInputFiles({
    name: 'zdjecie.jpg', mimeType: 'image/jpeg', buffer: bigPhoto,
  })
  await expect(page.getByRole('button', { name: 'Usuń zdjęcie' })).toBeVisible({ timeout: 60_000 })

  const grab = async (name) => {
    const dl = page.waitForEvent('download', { timeout: 120_000 })
    await page.getByRole('button', { name }).click()
    const confirmBtn = page.getByRole('button', { name: 'Pobierz mimo to' })
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) await confirmBtn.click()
    const f = await dl
    const path = await f.path()
    return { path, size: (await fs.readFile(path)).length }
  }

  const transfer = await grab(/Przenieś na inne urządzenie/)
  const zip = await grab(/Zapisz ZIP/)

  // Paczka ZIP nadal archiwizuje pełny oryginał…
  expect(zip.size).toBeGreaterThan(bigPhoto.length)
  // …a plik do przenoszenia mieści się w mailu i jest ułamkiem tamtego.
  expect(transfer.size).toBeLessThan(zip.size / 2)
  expect(transfer.size).toBeLessThan(2_000_000)

  // --- Odchudzone zdjęcie musi WRÓCIĆ przy imporcie ---
  // Osobny kontekst = czyste localStorage i czyste IndexedDB, czyli naprawdę
  // drugie urządzenie: gdyby profil 'lite' zgubił oryginał, raport przyjechałby
  // bez zdjęcia i nie dałoby się go dalej edytować ani wydrukować.
  const ctx = await browser.newContext()
  const page2 = await ctx.newPage()
  await page2.addInitScript(() => {
    try { localStorage.setItem('suresolutions.onboarding.v2.dismissed', '1') } catch {}
  })
  await page2.goto('/#/reports')
  await page2.locator('input[type="file"]').first().setInputFiles(transfer.path)
  await page2.getByRole('button', { name: 'Importuj' }).click({ timeout: 30_000 })

  await expect.poll(async () => page2.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('suresolutions.images.v1')
    req.onsuccess = () => {
      const db = req.result
      const st = db.transaction('originals').objectStore('originals').getAllKeys()
      st.onsuccess = () => resolve(st.result.length)
      st.onerror = () => resolve(-1)
    }
    req.onerror = () => resolve(-1)
  })), { timeout: 30_000 }).toBeGreaterThan(0)

  await page2.goto('/#/service/r_size')
  await expect(page2.getByRole('button', { name: 'Usuń zdjęcie' })).toBeVisible({ timeout: 30_000 })
  await ctx.close()
})

test('podgląd PDF w aplikacji renderuje strony (v0.35)', async ({ page }) => {
  const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 30, g: 110, b: 180 } } })
    .jpeg().toBuffer()
  const dataUrl = 'data:image/jpeg;base64,' + jpg.toString('base64')
  const report = {
    id: 'r_prev_test', type: 'service', status: 'draft', schemaVersion: 1,
    createdAt: '2026-06-19T08:00:00.000Z', updatedAt: '2026-06-19T08:00:00.000Z',
    header: { reportNumber: 'RPT-99-992-2026-06-19', projectName: 'Projekt', machineName: 'Maszyna', date: '2026-06-19', author: 'Jan' },
    visit: { client: 'Klient', location: 'Hala', arrival: '08:00', departure: '10:00' },
    role: 'serwisant', visitStatus: 'completed',
    actions: [{ id: 'a1', description: 'Czynność', media: [{ id: 'm1', kind: 'image', photoId: 'p1', dataUrl }] }],
    parts: [], observations: [], recommendations: 'OK', receivedBy: 'Klient',
  }
  await page.addInitScript((r) => {
    try { localStorage.setItem('suresolutions.report.v2:' + r.id, JSON.stringify(r)) } catch {}
  }, report)

  await page.goto('/#/service/r_prev_test')
  await page.getByRole('button', { name: /Podgląd/ }).click()

  // pdf.js wczytał + sparsował PDF → nagłówek pokazuje liczbę stron
  await expect(page.locator('.fixed.inset-0').getByText(/\d+\s*stron/)).toBeVisible({ timeout: 60_000 })
  // …i co najmniej jedna strona wyrenderowała się na <canvas> (worker działa)
  await expect(page.locator('.fixed.inset-0 canvas').first()).toBeVisible({ timeout: 60_000 })
})
