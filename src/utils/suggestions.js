import { loadAll } from './storage.js'
import { reportClient, reportLocation } from './reportFields.js'

// Walks the saved-reports list and returns deduplicated values from the chosen
// field, ordered by recency (most-recently-seen first). Used to power the native
// <datalist> autocomplete on inputs that have a tendency to repeat across visits
// (client names, machine names, author, project names, etc.).
//
// `pickFn(report) -> string | null` extracts the value from one report.
// `filterFn(report) -> bool` optionally narrows the scope (e.g. only service type).
function distinctRecent(pickFn, filterFn) {
  const all = loadAll()
  const seen = new Map() // value -> latest timestamp
  for (const r of all) {
    if (filterFn && !filterFn(r)) continue
    const val = pickFn(r)
    if (!val || typeof val !== 'string') continue
    const t = String(val).trim()
    if (!t) continue
    const ts = new Date(r.updatedAt || r.createdAt || 0).getTime()
    if (!seen.has(t) || seen.get(t) < ts) seen.set(t, ts)
  }
  return Array.from(seen.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v)
}

// ---- Header (cross-type) ----
export const suggestAuthors        = () => distinctRecent((r) => r.header?.author)
export const suggestProjectNames   = () => distinctRecent((r) => r.header?.projectName)
export const suggestProjectNumbers = () => distinctRecent((r) => r.header?.projectNumber)

// Machine names — narrowed by project if user has already picked one
export function suggestMachineNames(currentProject) {
  const sameProject = currentProject
    ? distinctRecent((r) => r.header?.machineName, (r) => r.header?.projectName === currentProject)
    : []
  const allMachines = distinctRecent((r) => r.header?.machineName)
  // Project-specific first, then everything else (without duplicates)
  const seen = new Set(sameProject)
  return [...sameProject, ...allMachines.filter((m) => !seen.has(m))]
}

// ---- Klient / lokalizacja (od v0.52 wspólne dla WSZYSTKICH typów) ----
// Wcześniej liczone tylko z raportów serwisowych — teraz klient jest w header,
// więc podpowiedzi zbierają się też z uruchomień, odbiorów, prototypów i lekcji.
export const suggestClients = () => distinctRecent((r) => reportClient(r))

// Locations narrowed by client
export function suggestLocations(currentClient) {
  const sameClient = currentClient
    ? distinctRecent((r) => reportLocation(r), (r) => reportClient(r) === currentClient)
    : []
  const all = distinctRecent((r) => reportLocation(r))
  const seen = new Set(sameClient)
  return [...sameClient, ...all.filter((m) => !seen.has(m))]
}

// ---- Kilometry dojazdu (serwis, v0.53) ----
// Dystans do danego klienta jest STAŁY, więc druga i każda kolejna wizyta
// powinna kosztować jedno tapnięcie w chip, a nie wpisywanie liczby. Najpierw
// wartości z wizyt u TEGO klienta (zwykle jedna), potem pozostałe jako zapas.
export function suggestTravelKm(currentClient) {
  const km = (r) => {
    const v = r.visit?.travelKm
    return v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : String(v)
  }
  const isService = (r) => r.type === 'service'
  const sameClient = currentClient
    ? distinctRecent(km, (r) => isService(r) && reportClient(r) === currentClient)
    : []
  const all = distinctRecent(km, isService)
  const seen = new Set(sameClient)
  return [...sameClient, ...all.filter((v) => !seen.has(v))]
}

export function suggestPartNames() {
  const out = new Map()
  for (const r of loadAll().filter((r) => r.type === 'service')) {
    for (const p of (r.parts || [])) {
      const t = (p.name || '').trim()
      if (!t) continue
      const ts = new Date(r.updatedAt || r.createdAt || 0).getTime()
      if (!out.has(t) || out.get(t) < ts) out.set(t, ts)
    }
  }
  return Array.from(out.entries()).sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

export function suggestPartCatalogNos() {
  const out = new Map()
  for (const r of loadAll().filter((r) => r.type === 'service')) {
    for (const p of (r.parts || [])) {
      const t = (p.catalogNo || '').trim()
      if (!t) continue
      const ts = new Date(r.updatedAt || r.createdAt || 0).getTime()
      if (!out.has(t) || out.get(t) < ts) out.set(t, ts)
    }
  }
  return Array.from(out.entries()).sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

// ---- Prototype-specific ----
export const suggestComponents = () => distinctRecent((r) => r.info?.component, (r) => r.type === 'prototype')

// ---- Reklamacja ----
// Dostawca (v0.52) — bez niego nie dało się policzyć reklamacji per dostawca.
export const suggestSuppliers = () => distinctRecent((r) => r.supplier, (r) => r.type === 'complaint')
