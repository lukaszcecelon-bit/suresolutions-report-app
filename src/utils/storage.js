import { deleteImages, deleteVideos, deleteOriginals } from './imageStore.js'

// === Format przechowywania ===
// v2: KAŻDY raport pod własnym kluczem `suresolutions.report.v2:<id>`.
// Wcześniej (v1) wszystkie raporty siedziały w jednej tablicy pod jednym
// kluczem — każdy autosave (co 300 ms pauzy w pisaniu) robił JSON.parse +
// JSON.stringify CAŁEJ bazy. Przy kilkudziesięciu raportach z długimi
// tekstami to było odczuwalne na starszych telefonach. Teraz autosave
// serializuje wyłącznie edytowany raport.
//
// Do tego cache w pamięci: localStorage czytamy raz na sesję (i po zdarzeniu
// 'storage' z innej karty), potem wszystkie loadAll()/getById() są darmowe.
// Mutacje tworzą NOWĄ tablicę cache — konsumenci (np. refresh() na Home)
// dostają świeżą referencję, więc React poprawnie re-renderuje.
const LEGACY_KEY = 'suresolutions.reports.v1'
const PREFIX = 'suresolutions.report.v2:'

// Wersja schematu pojedynczego raportu. Podbij przy zmianie kształtu danych
// i dopisz krok w migrateReport() — zamiast rozsianych po komponentach
// "if (Array.isArray(...))". Raporty migrują się przy odczycie, a trwale
// przy najbliższym zapisie (upsert stempluje aktualną wersję).
export const SCHEMA_VERSION = 3

let cache = null

const reportKey = (id) => PREFIX + id

// Pole tekstowe (stary model) → lista rekordów [{id,text,media}] (nowy model).
function strToRecords(v) {
  const txt = typeof v === 'string' ? v.trim() : ''
  return txt ? [{ id: newId(), text: txt, media: [] }] : []
}

// Migracje kształtu danych (kumulatywne, idempotentne):
//  v0→v1: service.observations string→lista; satfat.punchlist media:[]
//  v1→v2: service.recommendations string→lista; commissioning.observations
//         i .conclusions string→lista (te pola stały się listami rekordów).
//  v2→v3: satfat.conclusions string→lista rekordów.
function migrateReport(r) {
  if (!r || typeof r !== 'object') return r
  if ((r.schemaVersion || 0) >= SCHEMA_VERSION) return r
  const m = { ...r }
  if (m.type === 'service') {
    if (!Array.isArray(m.observations)) m.observations = strToRecords(m.observations)
    if (!Array.isArray(m.recommendations)) m.recommendations = strToRecords(m.recommendations)
  }
  if (m.type === 'satfat') {
    if (Array.isArray(m.punchlist)) m.punchlist = m.punchlist.map((p) => ({ media: [], ...p }))
    if (!Array.isArray(m.conclusions)) m.conclusions = strToRecords(m.conclusions)
  }
  if (m.type === 'commissioning') {
    if (!Array.isArray(m.observations)) m.observations = strToRecords(m.observations)
    if (!Array.isArray(m.conclusions)) m.conclusions = strToRecords(m.conclusions)
  }
  m.schemaVersion = SCHEMA_VERSION
  return m
}

// Jednorazowe rozbicie starego klucza zbiorczego na klucze per raport.
function migrateLegacyKey() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (r && r.id && !localStorage.getItem(reportKey(r.id))) {
          localStorage.setItem(reportKey(r.id), JSON.stringify(r))
        }
      }
    }
    localStorage.removeItem(LEGACY_KEY)
  } catch (e) {
    console.warn('Migracja starego formatu raportów nie powiodła się', e)
  }
}

function readAllFromDisk() {
  migrateLegacyKey()
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(PREFIX)) continue
      try {
        const r = JSON.parse(localStorage.getItem(k))
        if (r && r.id) out.push(migrateReport(r))
      } catch {} // pojedynczy uszkodzony wpis nie blokuje reszty bazy
    }
  } catch {}
  return out
}

// Inna karta/zakładka zapisała raport → unieważnij cache (odczyt przy
// następnym loadAll). Zdarzenie 'storage' NIE odpala się w karcie, która
// sama zapisała — więc nie kasujemy własnego cache przy każdym autosave.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === LEGACY_KEY || (e.key && e.key.startsWith(PREFIX))) {
      cache = null
    }
  })
}

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

// Zwracana tablica jest współdzielona (cache) — traktuj jako read-only;
// przed sortowaniem zrób kopię ([...]). Wszyscy obecni konsumenci tak robią.
export function loadAll() {
  if (!cache) cache = readAllFromDisk()
  return cache
}

export function upsert(report) {
  const next = { ...report, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() }
  loadAll()
  const idx = cache.findIndex((r) => r.id === next.id)
  if (idx >= 0) {
    cache = cache.slice()
    cache[idx] = next
  } else {
    cache = [next, ...cache]
  }
  try {
    localStorage.setItem(reportKey(next.id), JSON.stringify(next))
  } catch (e) {
    // Quota / tryb prywatny: dane zostają w cache (sesja działa dalej,
    // eksport paczki wciąż możliwy) — nie wywracamy UI wyjątkiem z autosave.
    console.error('Zapis raportu do localStorage nie powiódł się', e)
  }
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
  loadAll()
  cache = cache.filter((r) => r.id !== id)
  try { localStorage.removeItem(reportKey(id)) } catch {}
}

export function newId() {
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// Clones a report into a fresh "template" — keeps reusable bits (header, client,
// project, conditions/params for prototypes) but **drops everything specific to
// the original visit/test**: stops, actions, parts, points, photos, descriptions,
// statuses. Goal: speed up the start of a recurring visit / next iteration.
//
// Photos are intentionally NOT cloned so the ZIP package won't ship duplicates
// referencing photos that "belong" to another visit.
export function cloneReport(source) {
  const todayISO = () => new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  const base = {
    id: newId(),
    type: source.type,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    header: {
      ...source.header,
      // Each new report must have its own unique number; date defaults to today
      reportNumber: '',
      date: todayISO(),
    },
  }

  if (source.type === 'commissioning') {
    // Numer raportu jak w serwisie: URU-{nr projektu}-{data}, przeliczany z
    // zachowanego numeru projektu (data → dziś).
    const projectNumber = source.header?.projectNumber || ''
    const date = todayISO()
    return {
      ...base,
      header: {
        ...base.header,
        projectNumber,
        reportNumber: projectNumber ? `URU-${projectNumber}-${date}` : '',
      },
      phase: 'setup',
      sessionStartAt: null,
      sessionEndAt: null,
      activeStop: null,
      stops: [],          // never carry over stops
      observations: [],
      conclusions: [],
      generalMedia: [],
    }
  }

  if (source.type === 'service') {
    // Zachowujemy numer projektu (zwykle ten sam projekt), data → dziś,
    // numer raportu przeliczamy: RPT-{nr projektu}-{data}.
    const projectNumber = source.header?.projectNumber || ''
    const date = todayISO()
    return {
      ...base,
      header: {
        ...base.header,
        projectNumber,
        reportNumber: projectNumber ? `RPT-${projectNumber}-${date}` : '',
      },
      visit: {
        client: source.visit?.client || '',     // keep — recurring client
        location: source.visit?.location || '', // keep — same site
        arrival: '',                            // reset — this visit
        departure: '',
      },
      role: source.role || '',                   // keep — zwykle ten sam serwisant
      actions: [],
      parts: [],
      observations: [],                          // lista rekordów
      recommendations: [],                       // lista rekordów
      receivedBy: '',                            // reset — nowa wizyta
      visitStatus: 'completed',
    }
  }

  if (source.type === 'satfat') {
    const projectNumber = source.header?.projectNumber || ''
    const date = todayISO()
    const testType = source.testType || 'fat'
    return {
      ...base,
      header: {
        ...base.header,
        projectNumber,
        reportNumber: projectNumber ? `${testType.toUpperCase()}-${projectNumber}-${date}` : '',
      },
      testType,                                            // keep — repeat odbioru same type
      info: {
        client: source.info?.client || '',                 // keep — same client
        location: source.info?.location || '',             // keep — same site
        referenceDoc: source.info?.referenceDoc || '',     // keep — same procedure
      },
      participants: {
        // Keep participant lists but strip IDs — fresh entries on a new visit
        client: (source.participants?.client || []).map((p) => ({
          id: newId(), name: p.name || '', role: p.role || '',
        })),
        vendor: (source.participants?.vendor || []).map((p) => ({
          id: newId(), name: p.name || '', role: p.role || '',
        })),
      },
      tests: [],                                            // tests are per-session — never carry over
      punchlist: [],                                        // ditto
      finalStatus: 'accepted',
      conclusions: [],                                      // lista rekordów (jak w serwisie)
      signatures: { clientName: '', clientDate: '', vendorName: '', vendorDate: '' },
      media: [],
    }
  }

  if (source.type === 'complaint') {
    // Duplikat reklamacji: zachowujemy nr projektu, część, e-mail zakupowca
    // (zwykle ta sama partia/dostawca); czyścimy zdjęcia, opis, kategorię, flagę.
    const projectNumber = source.header?.projectNumber || ''
    const date = todayISO()
    return {
      ...base,
      header: {
        ...base.header,
        projectNumber,
        reportNumber: projectNumber ? `REK-${projectNumber}-${date}` : '',
      },
      partNo: source.partNo || '',
      defectCategory: '',
      blocksAssembly: false,
      description: '',
      media: [],
      buyerEmail: source.buyerEmail || '',
    }
  }

  if (source.type === 'prototype') {
    const projectNumber = source.header?.projectNumber || ''
    const date = todayISO()
    return {
      ...base,
      header: {
        ...base.header,
        projectNumber,
        reportNumber: projectNumber ? `PRT-${projectNumber}-${date}` : '',
      },
      info: {
        component: source.info?.component || '',                 // keep — same part
        iteration: (source.info?.iteration || 1) + 1,            // bump for next iteration
        sampleMethod: source.info?.sampleMethod || 'print3d',    // keep
        sampleMethodOther: source.info?.sampleMethodOther || '',
        goal: '',                                                // each iteration sets its own
        media: [],
      },
      conditions: {
        setup: source.conditions?.setup || '',                   // keep — same setup
        params: (source.conditions?.params || []).map((p) => ({  // keep — parameter template
          id: newId(), key: p.key || '', value: p.value || '',
        })),
      },
      points: [],
      overallResult: '',
      resultsMedia: [],
      observations: '',
      observationsMedia: [],
      decision: '',
      decisionNotes: '',
      media: [],
    }
  }

  if (source.type === 'lesson') {
    // Lekcja projektowa: zachowujemy projekt/maszynę/etap/kategorię (zwykle ten
    // sam kontekst), czyścimy sam opis błędu, skutek i wnioski.
    const projectNumber = source.header?.projectNumber || ''
    const date = todayISO()
    return {
      ...base,
      header: {
        ...base.header,
        projectNumber,
        reportNumber: projectNumber ? `LL-${projectNumber}-${date}` : '',
      },
      drawingNo: source.drawingNo || '',   // keep — zwykle ten sam rysunek/DTR
      stage: source.stage || '',           // keep — ten sam etap wykrycia
      category: source.category || '',     // keep — zwykle ta sama kategoria
      severity: '',                        // reset — nowa lekcja
      problem: '',
      problemMedia: [],
      impact: '',
      lessons: [],                         // rekordy {id,text,media}
    }
  }

  return base
}
