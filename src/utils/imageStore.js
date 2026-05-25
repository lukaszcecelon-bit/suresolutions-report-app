const DB_NAME = 'suresolutions.images.v1'
const STORE_IMAGES = 'images'       // skompresowane miniatury (400×300, dataURL string) — UI + PDF
const STORE_VIDEOS = 'videos'       // wideo (Blob) — ZIP wideo/
const STORE_ORIGINALS = 'originals' // pełne, oryginalne zdjęcia (Blob) — ZIP zdjecia/
const VERSION = 3

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Ta przeglądarka nie wspiera IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_IMAGES)) db.createObjectStore(STORE_IMAGES)
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) db.createObjectStore(STORE_VIDEOS)
      if (!db.objectStoreNames.contains(STORE_ORIGINALS)) db.createObjectStore(STORE_ORIGINALS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
  return dbPromise
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function putGeneric(store, value, prefix) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const id = genId(prefix)
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, id)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

function getGeneric(store, id) {
  if (!id) return Promise.resolve(null)
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  }))
}

function getManyGeneric(store, ids) {
  const out = new Map()
  if (!ids || ids.length === 0) return Promise.resolve(out)
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const s = tx.objectStore(store)
    let pending = ids.length
    ids.forEach((id) => {
      const req = s.get(id)
      req.onsuccess = () => {
        if (req.result) out.set(id, req.result)
        pending--
        if (pending === 0) resolve(out)
      }
      req.onerror = () => {
        pending--
        if (pending === 0) resolve(out)
      }
    })
    tx.onerror = () => reject(tx.error)
  }))
}

function deleteManyGeneric(store, ids) {
  if (!ids || ids.length === 0) return Promise.resolve()
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const s = tx.objectStore(store)
    ids.forEach((id) => { if (id) s.delete(id) })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

// ---- Images (dataURL strings) ----
export const putImage = (dataUrl) => putGeneric(STORE_IMAGES, dataUrl, 'p')
export const getImage = (id) => getGeneric(STORE_IMAGES, id)
export const getImages = (ids) => getManyGeneric(STORE_IMAGES, ids)
export const deleteImage = (id) => deleteManyGeneric(STORE_IMAGES, [id])
export const deleteImages = (ids) => deleteManyGeneric(STORE_IMAGES, ids)

export async function replaceImage(id, dataUrl) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMAGES, 'readwrite')
    tx.objectStore(STORE_IMAGES).put(dataUrl, id)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// ---- Videos (Blob/File) ----
export const putVideo = (blob) => putGeneric(STORE_VIDEOS, blob, 'v')
export const getVideo = (id) => getGeneric(STORE_VIDEOS, id)
export const getVideos = (ids) => getManyGeneric(STORE_VIDEOS, ids)
export const deleteVideo = (id) => deleteManyGeneric(STORE_VIDEOS, [id])
export const deleteVideos = (ids) => deleteManyGeneric(STORE_VIDEOS, ids)

// Wstawia wideo z KONKRETNYM id (zamiast generować nowe) — używane przy
// imporcie paczek synchronizacyjnych żeby zachować referencje z report.json.
export async function replaceVideo(id, blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VIDEOS, 'readwrite')
    tx.objectStore(STORE_VIDEOS).put(blob, id)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// ---- Originals (Blob/File) — full-resolution photos used by ZIP package ----
export const putOriginal = (blob) => putGeneric(STORE_ORIGINALS, blob, 'o')
export const getOriginal = (id) => getGeneric(STORE_ORIGINALS, id)
export const getOriginals = (ids) => getManyGeneric(STORE_ORIGINALS, ids)
export const deleteOriginal = (id) => deleteManyGeneric(STORE_ORIGINALS, [id])
export const deleteOriginals = (ids) => deleteManyGeneric(STORE_ORIGINALS, ids)

export async function replaceOriginal(id, blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORIGINALS, 'readwrite')
    tx.objectStore(STORE_ORIGINALS).put(blob, id)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function getStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null
  return navigator.storage.estimate()
}
