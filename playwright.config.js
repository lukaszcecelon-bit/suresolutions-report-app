import { defineConfig } from 'playwright/test'

// Smoke testy E2E przeciwko PRODUKCYJNEMU buildowi (vite preview na dist/).
// Wymaga wcześniejszego `npm run build` (CI robi to i tak przed deployem;
// lokalnie: npm run build && npm run test:e2e).
export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
