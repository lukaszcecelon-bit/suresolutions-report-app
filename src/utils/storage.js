import { deleteImages } from './imageStore.js'

const KEY = 'suresolutions.reports.v1'

export function collectPhotoIds(value, out = new Set()) {
  if (value === null || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const v of value) collectPhotoIds(v, out)
    return out
  }
  if (value.kind === 'image' && value.photoId) out.add(value.photoId)
  for (const k of Object.keys(value)) collectPhotoIds(value[k], out)
  return out
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
    const ids = collectPhotoIds(report)
    if (ids.size > 0) {
      deleteImages(Array.from(ids)).catch((e) => console.warn('IDB cleanup failed', e))
    }
  }
  saveAll(loadAll().filter((r) => r.id !== id))
}

export function newId() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
