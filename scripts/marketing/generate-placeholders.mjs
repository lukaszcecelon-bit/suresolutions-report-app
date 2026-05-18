// Generate stylized "industrial photo" placeholders for demo reports.
// These are intentionally synthetic — clear they're not real shop-floor photos —
// but visually rich enough to make the marketing screenshots/videos feel realistic.
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(__dirname, 'placeholder-images')

await mkdir(OUT, { recursive: true })

// Each placeholder is an SVG rendered to JPEG. The SVG composition gives us
// large headlines + technical-looking annotations without needing real photos.
function svgFor(opts) {
  const { title, subtitle, accent = '#3D70B2', bg1 = '#1F2937', bg2 = '#374151' } = opts
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${bg1}"/>
        <stop offset="1" stop-color="${bg2}"/>
      </linearGradient>
      <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#FFFFFF15" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <rect width="1200" height="900" fill="url(#grid)"/>
    <!-- Decorative technical shapes -->
    <circle cx="950" cy="200" r="120" fill="none" stroke="${accent}" stroke-width="3" opacity="0.5"/>
    <circle cx="950" cy="200" r="80" fill="none" stroke="${accent}" stroke-width="2" opacity="0.6"/>
    <rect x="100" y="650" width="350" height="180" fill="none" stroke="${accent}" stroke-width="3" opacity="0.5" rx="8"/>
    <line x1="100" y1="500" x2="1100" y2="500" stroke="${accent}" stroke-width="1" opacity="0.3" stroke-dasharray="10,8"/>
    <!-- Headline + subtitle -->
    <text x="100" y="380" font-family="-apple-system, Segoe UI, Roboto, Arial, sans-serif"
          font-size="56" font-weight="700" fill="#FFFFFF">${escapeXml(title)}</text>
    <text x="100" y="440" font-family="-apple-system, Segoe UI, Roboto, Arial, sans-serif"
          font-size="28" font-weight="500" fill="${accent}">${escapeXml(subtitle)}</text>
    <!-- "Demo" mark in corner -->
    <text x="1100" y="850" font-family="-apple-system, Segoe UI, Roboto, Arial, sans-serif"
          font-size="18" font-weight="600" fill="#FFFFFF40" text-anchor="end">PRZYKŁAD · SureSolutions</text>
  </svg>`
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' }[c]))
}

const placeholders = [
  { file: 'photo-machine-overview.jpg',     title: 'Pakowaczka A-7',         subtitle: 'Stacja 3 · widok ogólny' },
  { file: 'photo-stoppage-detail.jpg',      title: 'Zacięcie detalu',         subtitle: 'Stacja 3 · 14:32', accent: '#EF4444' },
  { file: 'photo-electrical-cabinet.jpg',   title: 'Rozdzielnica elektryczna', subtitle: 'Naprawa SW14 → SW16', accent: '#10B981' },
  { file: 'photo-prototype-component.jpg',  title: 'Chwytak mechaniczny v3',  subtitle: 'Iteracja po Teście #2' },
  { file: 'photo-belt-replacement.jpg',     title: 'Pas przekładni',          subtitle: 'Wymiana zalecana w 30 dni', accent: '#F59E0B' },
  { file: 'photo-general-overview.jpg',     title: 'Linia produkcyjna',       subtitle: 'BSH-Łódź · widok ogólny' },
]

for (const p of placeholders) {
  const svg = svgFor(p)
  const out = resolve(OUT, p.file)
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 85 })
    .toFile(out)
  console.log('  ✓', p.file)
}

console.log('\nDone. Generated', placeholders.length, 'placeholder images in:', OUT)
