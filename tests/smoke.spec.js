import { test, expect } from 'playwright/test'

// Smoke test krytycznej ścieżki: apka się ładuje → raport da się utworzyć
// i zapisuje się lokalnie → paczka PDF realnie się generuje. Łapie regresje
// w storage (zapis/odczyt), routingu i pipeline PDF zanim trafią na produkcję.
// Celowo minimalny — ma być szybki i stabilny w CI, nie wyczerpujący.

test.beforeEach(async ({ page }) => {
  // Onboarding-tour zasłania wszystko przy pierwszej wizycie — wyłącz go,
  // zanim aplikacja wystartuje.
  await page.addInitScript(() => {
    try { localStorage.setItem('suresolutions.onboarding.v2.dismissed', '1') } catch {}
  })
})

test('strona główna się ładuje', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /Nowy raport/ })).toBeVisible()
})

test('raport serwisowy: zapis lokalny + generowanie paczki PDF', async ({ page }) => {
  // Nowy raport serwisowy (route bez id tworzy świeży szkic).
  await page.goto('/#/service')

  // Pierwsze pole nagłówka serwisu = numer projektu; z niego auto-generuje
  // się numer raportu RPT-99-999-{data}, po którym rozpoznamy raport na liście.
  const projectInput = page.locator('input.field-input').first()
  await projectInput.fill('99-999')

  // Autosave ma debounce 300 ms — daj mu chwilę na zapis do localStorage.
  await page.waitForTimeout(800)

  // Generowanie paczki: raport jest niekompletny → modal walidacji
  // („Pobierz mimo to") → realny download PDF (bez mediów = czysty .pdf).
  const downloadPromise = page.waitForEvent('download', { timeout: 120_000 })
  await page.getByRole('button', { name: /Pobierz paczkę/ }).click()
  await page.getByRole('button', { name: 'Pobierz mimo to' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.(pdf|zip)$/)

  // Raport widnieje na liście strony głównej (test warstwy storage po refaktorze).
  await page.goto('/')
  await expect(page.getByText(/RPT-99-999/).first()).toBeVisible()
})
