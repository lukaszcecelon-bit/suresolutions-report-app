import { deleteImages, deleteVideos, deleteOriginals } from './imageStore.js'

const KEY = 'suresolutions.reports.v1'

export function collectMediaIds(value, out) {
  if (!out) out = { photos: new Set(), originals: new Set(), videos: new Set() }
  if (value === null || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const v of value) collectMediaIds(v, out)
    return out
  }
  if (value.kind === 'image' && value.photoId) out.photos.add(value.photoId)
  if (value.kind === 'image' && value.originalId) out.originals.add(value.originalId)
  if (value.kind === 'video' && value.videoId) out.videos.add(value.videoId)
  for (const k of Object.keys(value)) collectMediaIds(value[k], out)
  return out
}

// Backwards-compat helper (used by pdfGenerator legacy path)
export function collectPhotoIds(value) {
  return collectMediaIds(value).photos
}

export function loadAll() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveAll(reports) {
  localStorage.setItem(KEY, JSON.stringify(reports))
}

export function upsert(report) {
  const all = loadAll()
  const idx = all.findIndex((r) => r.id === report.id)
  const next = { ...report, updatedAt: new Date().toISOString() }
  if (idx >= 0) all[idx] = next
  else all.unshift(next)
  saveAll(all)
  return next
}

export function getById(id) {
  return loadAll().find((r) => r.id === id) || null
}

export function remove(id) {
  const report = getById(id)
  if (report) {
    const m = collectMediaIds(report)
    if (m.photos.size > 0) {
      deleteImages(Array.from(m.photos)).catch((e) => console.warn('photo cleanup failed', e))
    }
    if (m.originals.size > 0) {
      deleteOriginals(Array.from(m.originals)).catch((e) => console.warn('original cleanup failed', e))
    }
    if (m.videos.size > 0) {
      deleteVideos(Array.from(m.videos)).catch((e) => console.warn('video cleanup failed', e))
    }
  }
  saveAll(loadAll().filter((r) => r.id !== id))
}

export function newId() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
