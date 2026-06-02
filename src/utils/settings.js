// Globalne ustawienia aplikacji — klient-only (localStorage). Czytane/zapisywane
// przez stronę Ustawień (#/settings). Na razie trzyma parametry integracji
// SharePoint (przygotowanie — aktywne po rejestracji w Entra ID).
//
// E-mail zakupowca celowo trzymany pod OSOBNYM, istniejącym kluczem
// (`BUYER_EMAIL_KEY`) — współdzielonym z formularzem reklamacji, żeby oba
// miejsca widziały tę samą wartość.

const KEY = 'suresolutions.settings.v1'

// Klucz współdzielony z ComplaintReport.jsx — NIE zmieniać bez zmiany tam.
export const BUYER_EMAIL_KEY = 'suresolutions.buyerEmail'

const DEFAULTS = {
  // Podfolder w KAŻDYM folderze projektu, do którego trafią raporty z aplikacji
  // po podłączeniu SharePointa. Decyzja użytkownika: na razie „08. Notesy"
  // (bez tworzenia nowego folderu). Konfigurowalne tutaj.
  sharepointSubfolder: '08. Notesy',
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY)
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  return next
}

export function getBuyerEmail() {
  try { return localStorage.getItem(BUYER_EMAIL_KEY) || '' } catch { return '' }
}

export function setBuyerEmailGlobal(v) {
  try { localStorage.setItem(BUYER_EMAIL_KEY, v || '') } catch {}
}
