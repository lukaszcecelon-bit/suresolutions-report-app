// Converts the WebM screencasts to MP4 (H.264) for maximum LinkedIn/Slack/Teams compatibility.
import ffmpegPath from 'ffmpeg-static'
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VIDEO_DIR = resolve(__dirname, '..', '..', 'marketing', 'videos')

const files = (await readdir(VIDEO_DIR)).filter((f) => f.endsWith('.webm'))
if (files.length === 0) {
  console.log('No .webm files in', VIDEO_DIR)
  process.exit(0)
}

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    p.stderr.on('data', (d) => { stderr += d.toString() })
    p.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.split('\n').slice(-5).join('\n')}`))
    })
  })
}

for (const f of files) {
  const inPath = resolve(VIDEO_DIR, f)
  const outPath = resolve(VIDEO_DIR, f.replace(/\.webm$/, '.mp4'))
  console.log(`converting ${f} → ${f.replace(/\.webm$/, '.mp4')}…`)
  await run([
    '-y', '-i', inPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'slow', '-crf', '20',
    '-movflags', '+faststart',
    '-an',
    outPath,
  ])
  console.log('  ✓')
}

console.log('Done.')
