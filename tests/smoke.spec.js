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

test('lekcja projektowa: PDF karty + eksport rejestru do XLSX (v0.40)', async ({ page }) => {
  // Lekcja z kompletem wymaganych pól (opis + kategoria + ≥1 wniosek) — bez
  // modala walidacji. Seed przez localStorage; brak mediów = brak IndexedDB.
  const report = {
    id: 'r_lesson_test', type: 'lesson', status: 'draft', schemaVersion: 3,
    createdAt: '2026-06-19T08:00:00.000Z', updatedAt: '2026-06-19T08:00:00.000Z',
    header: { reportNumber: 'LL-99-990-2026-06-19', projectNumber: '99-990', projectName: 'Projekt', machineName: 'Podajnik', date: '2026-06-19', author: 'Jan' },
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
  expect(pdfData.text).toContain('KONSTRUKCJI')     // tytuł/sekcja jako tekst
  expect(pdfData.text).toMatch(/[ĄĆĘŁŃÓŚŻŹ]/)        // polskie znaki (BŁĘDU)

  // --- 2) Eksport REJESTRU lekcji do XLSX z zakładki Raporty (v0.42) ---
  // Od v0.51 narzędzia archiwum (import/backup/rejestr) są w menu ⋯ w nagłówku,
  // żeby nie zajmowały stałych wierszy nad listą raportów.
  await page.goto('/#/reports')
  await page.getByRole('button', { name: 'Narzędzia archiwum' }).click()
  const dlXlsx = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('menuitem', { name: /Rejestr lekcji/ }).click()
  const xlsx = await dlXlsx
  expect(xlsx.suggestedFilename()).toMatch(/rejestr-lekcji.*\.xlsx$/)
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

  await page.locator('#sess-start').fill('08:00')
  await page.locator('#sess-end').fill('16:30')
  // Statystyka liczy się z wpisanych godzin (8 h 30 min pracy) — wartość jest
  // i w kaflu podsumowania, i pod polami godzin, stąd .first().
  await expect(page.getByText('08:30:00').first()).toBeVisible()

  // …a zatrzymania dopisuje się ręcznie także w podsumowaniu.
  await page.getByRole('button', { name: /Dodaj zatrzymanie ręcznie/ }).click()
  await expect(page.getByText('Edytuj zatrzymanie')).toBeVisible()
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
