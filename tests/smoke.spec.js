import { test, expect } from 'playwright/test'
import { PDFParse } from 'pdf-parse'
import fs from 'node:fs/promises'

// Smoke test krytycznej ścieżki: apka się ładuje → raport tworzy się i zapisuje
// → paczka PDF generuje się i zawiera PRAWDZIWY, kopiowalny tekst (nie obraz),
// z poprawnymi polskimi znakami. Strzeże celu migracji PDF→tekst natywny
// (jsPDF + osadzony font Roboto) przed regresją zanim trafi na produkcję.

test.beforeEach(async ({ page }) => {
  // Onboarding-tour zasłania UI przy pierwszej wizycie — wyłącz przed startem.
  await page.addInitScript(() => {
    try { localStorage.setItem('suresolutions.onboarding.v2.dismissed', '1') } catch {}
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
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Pobierz paczkę/ }).click()
  await page.getByRole('button', { name: 'Pobierz mimo to' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.(pdf|zip)$/)

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
