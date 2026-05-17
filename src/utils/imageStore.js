const DB_NAME = 'suresolutions.images.v1'
const STORE = 'images'
const VERSION = 1

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
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
  return dbPromise
}

function genPhotoId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
}

export async function putImage(dataUrl) {
  const db = await openDb()
  const id = genPhotoId()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(dataUrl, id)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function getImage(id) {
  if (!id) return null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

export async function getImages(ids) {
  const out = new Map()
  if (!ids || ids.length === 0) return out
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    let pending = ids.length
    ids.forEach((id) => {
      const req = store.get(id)
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
  })
}

export async function deleteImage(id) {
  if (!id) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteImages(ids) {
  if (!ids || ids.length === 0) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    ids.forEach((id) => { if (id) store.delete(id) })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Estimate storage usage (best effort)
export async function getStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null
  return navigator.storage.estimate()
}
