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
    return {
      ...base,
      phase: 'setup',
      sessionStartAt: null,
      sessionEndAt: null,
      activeStop: null,
      stops: [],          // never carry over stops
      observations: '',
      conclusions: '',
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
      recommendations: '',
      receivedBy: '',                            // reset — nowa wizyta
      visitStatus: 'completed',
    }
  }

  if (source.type === 'satfat') {
    return {
      ...base,
      testType: source.testType || 'fat',                  // keep — repeat odbioru same type
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
      conclusions: '',
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
    return {
      ...base,
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

  return base
}
