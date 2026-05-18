// Captures marketing-ready screenshots and short screencasts from the SureSolutions
// Report App. Seeds the local copy of the live app with realistic demo data first,
// then walks through the UI in two viewports (mobile + desktop) and records two
// flows as WebM videos.
//
// Output: ./marketing/{desktop,mobile,videos}/...
import { chromium, devices } from 'playwright'
import { mkdir, rename, readdir, copyFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDemoFixtures } from './seed-data.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')
const OUT_BASE = resolve(PROJECT_ROOT, 'marketing')
const OUT_DESKTOP = resolve(OUT_BASE, 'desktop')
const OUT_MOBILE = resolve(OUT_BASE, 'mobile')
const OUT_VIDEOS = resolve(OUT_BASE, 'videos')

// Use the live deployed URL — it's a static PWA so the seeded fixtures land in
// the same origin's localStorage/IDB.
const APP_URL = 'https://lukaszcecelon-bit.github.io/suresolutions-report-app/'

for (const d of [OUT_DESKTOP, OUT_MOBILE, OUT_VIDEOS]) await mkdir(d, { recursive: true })

// ---- Seeding helpers ----
async function seedAppData(page, fixtures) {
  // Wait until window is reachable
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(async ({ reports, idbSeed }) => {
    // Helper: open the IDB the same way the app does
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('suresolutions.images.v1', 3)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images')
          if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos')
          if (!db.objectStoreNames.contains('originals')) db.createObjectStore('originals')
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }

    async function dataUrlToBlob(dataUrl) {
      const r = await fetch(dataUrl); return r.blob()
    }

    const db = await openDb()

    // Put thumbnail dataURLs into 'images' store
    await new Promise((res, rej) => {
      const tx = db.transaction('images', 'readwrite')
      const store = tx.objectStore('images')
      for (const it of idbSeed.images) store.put(it.dataUrl, it.id)
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })

    // Put full-res Blobs into 'originals' store
    await new Promise(async (res, rej) => {
      const blobs = []
      for (const it of idbSeed.originals) blobs.push({ id: it.id, blob: await dataUrlToBlob(it.dataUrl) })
      const tx = db.transaction('originals', 'readwrite')
      const store = tx.objectStore('originals')
      for (const b of blobs) store.put(b.blob, b.id)
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })

    // Store reports in localStorage
    localStorage.setItem('suresolutions.reports.v1', JSON.stringify(reports))
    // Dismiss the first-visit onboarding card so screenshots are clean
    localStorage.setItem('suresolutions.onboarding.v1.dismissed', '1')
    // Dismiss install banner
    localStorage.setItem('suresolutions.install.dismissed', '1')
  }, fixtures)

  // Refresh so the app picks up the seeded state
  await page.reload({ waitUntil: 'networkidle' })
}

async function shoot(page, name, dir, opts = {}) {
  const path = resolve(dir, name)
  await page.waitForTimeout(opts.settle ?? 400)
  await page.screenshot({ path, fullPage: opts.fullPage ?? false })
  console.log('  📸', name)
}

async function shootFullPage(page, name, dir) {
  return shoot(page, name, dir, { fullPage: true, settle: 600 })
}

// ---- Capture: desktop screenshots ----
async function captureDesktopScreenshots(browser, fixtures) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await seedAppData(page, fixtures)

  console.log('\n📐 Desktop screenshots (1280×800 @2x)')

  // 1. Home
  await shoot(page, '01-home.png', OUT_DESKTOP)

  // 2. New report screen
  await page.click('text=+ Nowy raport')
  await shoot(page, '02-new-report-picker.png', OUT_DESKTOP)

  // 3. Open commissioning report (Phase 3 — completed with everything)
  await page.goBack({ waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  // Click on first report's "Otwórz" — that's the commissioning one (newest)
  await page.locator('button:has-text("Otwórz")').first().click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await shootFullPage(page, '03-commissioning-finished-full.png', OUT_DESKTOP)

  // 4. Scroll back to top and capture just the stats card
  await page.evaluate(() => window.scrollTo(0, 0))
  await shoot(page, '04-commissioning-summary-top.png', OUT_DESKTOP)

  // 5. Open service report
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.locator('button:has-text("Otwórz")').nth(1).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await shootFullPage(page, '05-service-report-full.png', OUT_DESKTOP)

  // 6. Capture top portion (header + visit data + actions)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shoot(page, '06-service-report-top.png', OUT_DESKTOP)

  await ctx.close()
}

// ---- Capture: mobile screenshots ----
async function captureMobileScreenshots(browser, fixtures) {
  const ctx = await browser.newContext({
    ...devices['iPhone 14'],
  })
  const page = await ctx.newPage()
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await seedAppData(page, fixtures)

  console.log('\n📱 Mobile screenshots (iPhone 14)')

  // 1. Home with list
  await shoot(page, '01-home.png', OUT_MOBILE)

  // 2. New report picker
  await page.click('text=+ Nowy raport')
  await shoot(page, '02-new-report-picker.png', OUT_MOBILE)
  await page.goBack({ waitUntil: 'networkidle' })

  // 3. Open commissioning report
  await page.locator('button:has-text("Otwórz")').first().click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await page.evaluate(() => window.scrollTo(0, 0))
  await shoot(page, '03-commissioning-summary.png', OUT_MOBILE)

  // 4. Scroll to log zatrzymań
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes('Log zatrzymań'))
    if (el) el.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(300)
  await shoot(page, '04-commissioning-stops-log.png', OUT_MOBILE)

  // 5. Scroll to general media (photo grid)
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes('Dokumentacja'))
    if (el) el.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(300)
  await shoot(page, '05-commissioning-photos.png', OUT_MOBILE)

  // 6. Open service report
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.locator('button:has-text("Otwórz")').nth(1).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await shoot(page, '06-service-top.png', OUT_MOBILE)

  // 7. Open prototype report
  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.locator('button:has-text("Otwórz")').nth(2).click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)
  await shoot(page, '07-prototype-top.png', OUT_MOBILE)

  // Scroll to results (C section)
  await page.evaluate(() => {
    const el = document.getElementById('sec-c')
    if (el) el.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(400)
  await shoot(page, '08-prototype-results.png', OUT_MOBILE)

  await ctx.close()
}

// ---- Capture: video flows ----
async function captureVideoFlows(browser, fixtures) {
  console.log('\n🎬 Video flows')

  // Video 1: Service report walkthrough (desktop, clean canvas)
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: OUT_VIDEOS, size: { width: 1280, height: 800 } },
    })
    const page = await ctx.newPage()
    await page.goto(APP_URL, { waitUntil: 'networkidle' })
    await seedAppData(page, fixtures)

    // Walk through Home → open service report → scroll → download (skip actual download)
    await page.waitForTimeout(1200)
    await page.locator('button:has-text("Otwórz")').nth(1).click() // service is 2nd
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    // Scroll slowly through the report
    await page.evaluate(async () => {
      const total = document.body.scrollHeight
      const step = 200
      for (let y = 0; y < total - window.innerHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 250))
      }
    })
    await page.waitForTimeout(1000)
    // Back to home
    await page.locator('a, button').filter({ hasText: 'Strona główna' }).first().click().catch(() => {})
    await page.waitForTimeout(800)
    await ctx.close()
    // Rename to predictable name
    const files = await readdir(OUT_VIDEOS)
    const recent = files.filter((f) => f.endsWith('.webm')).sort().pop()
    if (recent) await rename(resolve(OUT_VIDEOS, recent), resolve(OUT_VIDEOS, '01-service-walkthrough.webm'))
    console.log('  🎥 01-service-walkthrough.webm')
  }

  // Video 2: Commissioning report walkthrough (mobile viewport, more dynamic)
  {
    const ctx = await browser.newContext({
      ...devices['iPhone 14'],
      recordVideo: { dir: OUT_VIDEOS, size: { width: 390, height: 844 } },
    })
    const page = await ctx.newPage()
    await page.goto(APP_URL, { waitUntil: 'networkidle' })
    await seedAppData(page, fixtures)

    await page.waitForTimeout(1000)
    // Open commissioning (first report)
    await page.locator('button:has-text("Otwórz")').first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    // Scroll through
    await page.evaluate(async () => {
      const total = document.body.scrollHeight
      const step = 150
      for (let y = 0; y < total - window.innerHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 200))
      }
      // Scroll back to top
      await new Promise((r) => setTimeout(r, 500))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      await new Promise((r) => setTimeout(r, 800))
    })
    await page.waitForTimeout(500)
    await ctx.close()
    const files = await readdir(OUT_VIDEOS)
    const recent = files.filter((f) => f.endsWith('.webm') && f !== '01-service-walkthrough.webm').sort().pop()
    if (recent) await rename(resolve(OUT_VIDEOS, recent), resolve(OUT_VIDEOS, '02-commissioning-mobile.webm'))
    console.log('  🎥 02-commissioning-mobile.webm')
  }
}

// ---- Main ----
async function main() {
  console.log('SureSolutions Report App — marketing capture pipeline')
  console.log('URL:', APP_URL)

  const fixtures = await buildDemoFixtures()
  console.log(`\n📦 Loaded ${fixtures.reports.length} demo reports, ${fixtures.idbSeed.images.length} photos`)

  const browser = await chromium.launch({ headless: true })

  try {
    await captureDesktopScreenshots(browser, fixtures)
    await captureMobileScreenshots(browser, fixtures)
    await captureVideoFlows(browser, fixtures)
  } finally {
    await browser.close()
  }

  console.log('\n✓ Done. Output in:', OUT_BASE)
}

main().catch((e) => { console.error(e); process.exit(1) })
