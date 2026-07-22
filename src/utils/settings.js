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

// Lekcja projektowa (feedback do konstrukcji). Kategoria błędu klasyfikuje wpis
// w rejestrze — to ona (obok istotności) czyni bazę filtrowalną. Konfigurowalna
// w Ustawieniach; „Inne" NIE jest tu trzymane (komponent zawsze je dokleja).
export const DEFAULT_LESSON_CATEGORIES = [
  'Mechanika',
  'Elektryka',
  'Pneumatyka / hydraulika',
  'Sterowanie / PLC',
  'Dobór komponentu',
  'Tolerancje / pasowania',
  'Ergonomia serwisu',
  'Dokumentacja',
  'Bezpieczeństwo',
]

// Istotność błędu (klucz → etykieta). Klucz zapisujemy w danych, etykietę
// pokazujemy i eksportujemy do XLSX.
export const LESSON_SEVERITIES = [
  { key: 'critical', label: 'Krytyczny' },
  { key: 'major', label: 'Poważny' },
  { key: 'minor', label: 'Drobny' },
]

// Etap, na którym wykryto błąd — spina lekcję z resztą typów raportów.
export const LESSON_STAGES = [
  'Projekt',
  'Prototyp',
  'Montaż',
  'Uruchomienie',
  'Serwis',
  'SAT / FAT',
  'U klienta',
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
  // Konfigurowalne kategorie błędu (lekcja projektowa).
  lessonCategories: DEFAULT_LESSON_CATEGORIES,
}

// Autor/rola do prefilla nowych raportów.
export function getDefaultAuthor() { return loadSettings().defaultAuthor || '' }
export function getDefaultRole() { return loadSettings().defaultRole || '' }

// Lista powodów zatrzymań (bez „Inne"); pusta/uszkodzona → domyślna.
export function getStopReasons() {
  const s = loadSettings().stopReasons
  return Array.isArray(s) && s.length ? s.filter((x) => (x || '').trim()) : DEFAULT_STOP_REASONS
}

// Lista kategorii błędu dla lekcji projektowej (bez „Inne"); pusta → domyślna.
export function getLessonCategories() {
  const s = loadSettings().lessonCategories
  return Array.isArray(s) && s.length ? s.filter((x) => (x || '').trim()) : DEFAULT_LESSON_CATEGORIES
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

// Znacznik ostatniego pełnego backupu — trzymany pod osobnym kluczem (jak
// buyerEmail), NIE w obiekcie ustawień, żeby zapis backupu nie kolidował z
// edycją ustawień w innej karcie. Napędza przypomnienie o backupie na pulpicie.
const LAST_BACKUP_KEY = 'suresolutions.lastBackupAt'
export function getLastBackupAt() {
  try { return localStorage.getItem(LAST_BACKUP_KEY) || '' } catch { return '' }
}
export function setLastBackupAt(iso) {
  try { localStorage.setItem(LAST_BACKUP_KEY, iso || new Date().toISOString()) } catch {}
}

export function getBuyerEmail() {
  try { return localStorage.getItem(BUYER_EMAIL_KEY) || '' } catch { return '' }
}

export function setBuyerEmailGlobal(v) {
  try { localStorage.setItem(BUYER_EMAIL_KEY, v || '') } catch {}
}
