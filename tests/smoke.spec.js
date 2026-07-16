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
    visit: { client: 'Klient', location: 'Hala 1', arrival: '08:00', departure: '10:00' },
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

  // --- 2) Eksport REJESTRU lekcji do XLSX z Home ---
  await page.goto('/#/')
  const dlXlsx = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Rejestr lekcji/ }).click()
  const xlsx = await dlXlsx
  expect(xlsx.suggestedFilename()).toMatch(/rejestr-lekcji.*\.xlsx$/)
  // XLSX to archiwum ZIP — sygnatura „PK" na starcie pliku.
  const xlsxBuf = await fs.readFile(await xlsx.path())
  expect(xlsxBuf.subarray(0, 2).toString('latin1')).toBe('PK')
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
