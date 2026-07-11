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

// Domyślne role serwisanta — współdzielone z ServiceReport (select roli).
export const ROLE_OPTIONS = ['Technik serwisu', 'Konstruktor', 'Automatyk']

// Domyślne powody zatrzymania maszyny (raport uruchomienia). „Inne" NIE jest tu
// trzymane — komponent zawsze dokleja je na końcu (ścieżka custom-reason).
export const DEFAULT_STOP_REASONS = [
  'Zacięcie detalu',
  'Błąd programu',
  'Alarm bezpieczeństwa',
  'Regulacja',
  'Awaria mechaniczna',
]

const DEFAULTS = {
  // Podfolder w KAŻDYM folderze projektu, do którego trafią raporty z aplikacji
  // po podłączeniu SharePointa. Decyzja użytkownika: na razie „08. Notesy"
  // (bez tworzenia nowego folderu). Konfigurowalne tutaj.
  sharepointSubfolder: '08. Notesy',
  // Domyślny autor i rola — podpowiadane w nowych raportach (per urządzenie).
  // Każdy z zespołu ustawia raz swoje dane i nie wpisuje ich w kółko.
  defaultAuthor: '',
  defaultRole: '',
  // Konfigurowalne powody zatrzymania (raport uruchomienia).
  stopReasons: DEFAULT_STOP_REASONS,
}

// Autor/rola do prefilla nowych raportów.
export function getDefaultAuthor() { return loadSettings().defaultAuthor || '' }
export function getDefaultRole() { return loadSettings().defaultRole || '' }

// Lista powodów zatrzymań (bez „Inne"); pusta/uszkodzona → domyślna.
export function getStopReasons() {
  const s = loadSettings().stopReasons
  return Array.isArray(s) && s.length ? s.filter((x) => (x || '').trim()) : DEFAULT_STOP_REASONS
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
