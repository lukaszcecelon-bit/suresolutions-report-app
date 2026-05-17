// Generates square PWA icons from the wide SureSolutions logo.
// Outputs: public/icons/icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../src/assets/logo.png')
const OUT = resolve(__dirname, '../public/icons')

async function makeIcon(size, padPct, file) {
  const innerSize = Math.round(size * (1 - padPct * 2))
  const resized = await sharp(SRC)
    .resize({ width: innerSize, height: innerSize, fit: 'contain', background: '#FFFFFF' })
    .toBuffer()
  const offset = Math.round((size - innerSize) / 2)
  await sharp({
    create: { width: size, height: size, channels: 3, background: '#FFFFFF' },
  })
    .composite([{ input: resized, top: offset, left: offset }])
    .png()
    .toFile(file)
  console.log('  ✓', file.replace(OUT, '').replace(/^[\\/]/, ''), size + 'x' + size)
}

await mkdir(OUT, { recursive: true })
console.log('Generating PWA icons from', SRC)
await makeIcon(192, 0.06, resolve(OUT, 'icon-192.png'))
await makeIcon(512, 0.06, resolve(OUT, 'icon-512.png'))
await makeIcon(512, 0.18, resolve(OUT, 'icon-512-maskable.png'))
await makeIcon(180, 0.06, resolve(OUT, 'apple-touch-icon.png'))
console.log('Done.')
