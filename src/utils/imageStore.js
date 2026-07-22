const DB_NAME = 'suresolutions.images.v1'
const STORE_IMAGES = 'images'       // skompresowane miniatury (400×300, dataURL string) — UI + PDF
const STORE_VIDEOS = 'videos'       // wideo (Blob) — ZIP wideo/
const STORE_ORIGINALS = 'originals' // pełne, oryginalne zdjęcia (Blob) — ZIP zdjecia/
const STORE_MEDIUM = 'medium'       // cache 1200×900 (dataURL, klucz = originalId) — PDF embed
const VERSION = 4

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
      if (!db.objectStoreNames.contains(STORE_MEDIUM)) db.createObjectStore(STORE_MEDIUM)
    }
    req.onsuccess = () => {
      const db = req.result
      // Inna karta podbija wersję DB → zamknij to połączenie (żeby jej nie
      // blokować) i wyzeruj cache; kolejna operacja otworzy świeże połączenie.
      db.onversionchange = () => { try { db.close() } catch {} dbPromise = null }
      resolve(db)
    }
    // Błąd otwarcia — NIE cache'uj odrzuconej obietnicy (kolejna próba może się udać).
    req.onerror = () => { dbPromise = null; reject(req.error || new Error('IndexedDB open failed')) }
    // Inna karta trzyma starą wersję otwartą → open zawisłby w ciszy. Zamiast
    // wiecznie wiszącej obietnicy — odrzuć z czytelnym komunikatem.
    req.onblocked = () => { dbPromise = null; reject(new Error('Baza zablokowana przez inną otwartą kartę aplikacji — zamknij pozostałe karty i spróbuj ponownie')) }
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
// Usunięcie oryginału kasuje też jego cache medium-res (ten sam klucz).
export const deleteOriginal = (id) => deleteOriginals([id])
export const deleteOriginals = (ids) =>
  Promise.all([
    deleteManyGeneric(STORE_ORIGINALS, ids),
    deleteManyGeneric(STORE_MEDIUM, ids),
  ])

export async function replaceOriginal(id, blob) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    // Oryginał się zmienia (np. zapis adnotacji) → skasuj cache medium-res
    // dla tego id w tej samej transakcji, żeby PDF nie wziął starej wersji.
    const tx = db.transaction([STORE_ORIGINALS, STORE_MEDIUM], 'readwrite')
    tx.objectStore(STORE_ORIGINALS).put(blob, id)
    tx.objectStore(STORE_MEDIUM).delete(id)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// ---- Medium-res cache (dataURL 1200×900, klucz = originalId) ----
// Generowanie PDF zmniejsza oryginały do 1200×900 — to najdroższy etap
// przygotowania zdjęć (200-400 ms/szt.). Wynik trafia tutaj, więc KOLEJNE
// generowanie tej samej paczki pomija downsampling. Wpisy kasowane razem
// z oryginałem (deleteOriginals) i przy jego podmianie (replaceOriginal).
export const getMediums = (ids) => getManyGeneric(STORE_MEDIUM, ids)

export async function putMedium(id, dataUrl) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MEDIUM, 'readwrite')
    tx.objectStore(STORE_MEDIUM).put(dataUrl, id)
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const deleteMediums = (ids) => deleteManyGeneric(STORE_MEDIUM, ids)

// ---- Sprzątanie osieroconych blobów (GC) ----
// Zwraca wszystkie klucze z każdego magazynu — porównywane z referencjami
// zebranymi po raportach (collectMediaIds), żeby skasować bloby, do których
// nie ma już żadnego odwołania (np. po usunięciu pojedynczego zdjęcia z raportu,
// gdzie kasowany jest tylko rekord, nie blob).
function getAllKeys(store) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAllKeys()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  }))
}

export async function listAllMediaKeys() {
  const [images, videos, originals, medium] = await Promise.all([
    getAllKeys(STORE_IMAGES), getAllKeys(STORE_VIDEOS),
    getAllKeys(STORE_ORIGINALS), getAllKeys(STORE_MEDIUM),
  ])
  return { images, videos, originals, medium }
}

export async function getStorageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null
  return navigator.storage.estimate()
}

// Czy przeglądarka obiecała NIE czyścić pamięci tej aplikacji przy presji
// na dysk. null = API niedostępne (stare przeglądarki).
export async function isStoragePersisted() {
  if (!navigator.storage || !navigator.storage.persisted) return null
  try { return await navigator.storage.persisted() } catch { return null }
}

// Prośba o trwałość pamięci. Zwraca true/false (decyzja przeglądarki);
// zainstalowana PWA zwykle dostaje zgodę bez pytania użytkownika.
export async function persistStorage() {
  if (!navigator.storage || !navigator.storage.persist) return null
  try { return await navigator.storage.persist() } catch { return null }
}
