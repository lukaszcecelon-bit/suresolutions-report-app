import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vite base:
//  - './' produces relative paths that work both for `npm run preview` (root)
//    and GitHub Pages project pages (https://user.github.io/repo/) without
//    needing to know the repo name at build time.
//
// Chunking strategy: React is split into its own vendor chunk so it stays
// cached across our app-code deploys. The heavy PDF/ZIP libraries (jspdf,
// html2canvas, jszip) are dynamically imported from pdfGenerator.js — Vite
// auto-chunks them on its own, so no manualChunks entry needed.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'SureSolutions Raporty',
        short_name: 'SS Raporty',
        description: 'Aplikacja do tworzenia raportów testów, serwisów i uruchomień maszyn — SureSolutions',
        lang: 'pl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F3F4F6',
        theme_color: '#3D70B2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        // limit precache entry size so large jspdf/html2canvas chunks still get cached
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false, // SW off in dev; test offline via `npm run preview`
      },
    }),
  ],
})
