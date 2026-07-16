import { useEffect, useState } from 'react'
import { loadSettings, saveSettings, getBuyerEmail, setBuyerEmailGlobal, ROLE_OPTIONS } from '../utils/settings.js'
import { getStorageEstimate, isStoragePersisted, persistStorage } from '../utils/imageStore.js'

function formatBytes(n) {
  if (n === null || n === undefined) return '—'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Globalne ustawienia aplikacji (route #/settings, wejście przez ⚙️ w nagłówku).
// Wszystko zapisuje się automatycznie do localStorage przy każdej zmianie —
// spójnie z resztą aplikacji (auto-save).
export default function Settings({ navigate }) {
  const [settings, setSettings] = useState(() => loadSettings())
  const [buyerEmail, setBuyerEmailState] = useState(() => getBuyerEmail())
  const [estimate, setEstimate] = useState(null)       // { usage, quota } | null
  const [persisted, setPersisted] = useState(null)     // true/false/null (API brak)

  useEffect(() => {
    getStorageEstimate().then(setEstimate).catch(() => {})
    isStoragePersisted().then(setPersisted).catch(() => {})
  }, [])

  const requestPersist = async () => {
    const granted = await persistStorage()
    if (granted !== null) setPersisted(granted)
  }

  const updateSubfolder = (v) => {
    setSettings(saveSettings({ sharepointSubfolder: v }))
  }
  const updateAuthor = (v) => setSettings(saveSettings({ defaultAuthor: v }))
  const updateRole = (v) => setSettings(saveSettings({ defaultRole: v }))
  const updateStopReasons = (arr) => setSettings(saveSettings({ stopReasons: arr }))
  const updateLessonCategories = (arr) => setSettings(saveSettings({ lessonCategories: arr }))
  const updateBuyerEmail = (v) => {
    setBuyerEmailState(v)
    setBuyerEmailGlobal(v)
  }

  const usagePct = estimate?.quota ? Math.min(100, Math.round((estimate.usage / estimate.quota) * 100)) : null

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>

      <div>
        <h1 className="text-2xl font-bold text-sure-dark dark:text-gray-100">Ustawienia</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          Zmiany zapisują się automatycznie. Ustawienia są lokalne — dotyczą tego urządzenia.
        </p>
      </div>

      {/* === Domyślny autor i rola === */}
      <section className="card">
        <h2 className="section-title">👤 Domyślny autor i rola</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
          Podpowiadane automatycznie w <strong>nowych</strong> raportach na tym urządzeniu —
          ustaw raz swoje dane i nie wpisuj ich w kółko. W konkretnym raporcie można je nadpisać.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Autor (imię i nazwisko)</label>
            <input
              type="text"
              className="field-input"
              value={settings.defaultAuthor || ''}
              onChange={(e) => updateAuthor(e.target.value)}
              placeholder="np. Jan Kowalski"
            />
          </div>
          <div>
            <label className="field-label">Domyślna rola (serwis)</label>
            <select
              className="field-input"
              value={settings.defaultRole || ''}
              onChange={(e) => updateRole(e.target.value)}
            >
              <option value="">— brak —</option>
              {ROLE_OPTIONS.map((ro) => <option key={ro} value={ro}>{ro}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* === Powody zatrzymań (raport uruchomienia) === */}
      <section className="card">
        <h2 className="section-title">⏸ Powody zatrzymań maszyny</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
          Lista wyboru w raporcie uruchomienia (przy logowaniu zatrzymania). „Inne" (własny opis)
          jest zawsze dostępne — nie trzeba go tu dodawać.
        </p>
        <div className="space-y-2">
          {(settings.stopReasons || []).map((reason, i) => (
            <div key={i} className="flex gap-2">
              <span className="index-badge shrink-0">{i + 1}</span>
              <input
                type="text"
                className="field-input flex-1 min-w-0"
                value={reason}
                onChange={(e) => {
                  const next = [...settings.stopReasons]
                  next[i] = e.target.value
                  updateStopReasons(next)
                }}
                placeholder="np. Regulacja"
              />
              <button
                type="button"
                onClick={() => updateStopReasons(settings.stopReasons.filter((_, j) => j !== i))}
                className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40 shrink-0"
                aria-label="Usuń powód"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => updateStopReasons([...(settings.stopReasons || []), ''])}
          className="mt-2 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full"
        >
          + Dodaj powód
        </button>
      </section>

      {/* === Kategorie błędu (lekcja projektowa) === */}
      <section className="card">
        <h2 className="section-title">🎓 Kategorie błędu (lekcja projektowa)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
          Lista wyboru w raporcie „Lekcja projektowa". To po niej (obok istotności)
          filtrujesz rejestr lekcji w Excelu. „Inne" jest zawsze dostępne — nie trzeba go dodawać.
        </p>
        <div className="space-y-2">
          {(settings.lessonCategories || []).map((cat, i) => (
            <div key={i} className="flex gap-2">
              <span className="index-badge shrink-0">{i + 1}</span>
              <input
                type="text"
                className="field-input flex-1 min-w-0"
                value={cat}
                onChange={(e) => {
                  const next = [...settings.lessonCategories]
                  next[i] = e.target.value
                  updateLessonCategories(next)
                }}
                placeholder="np. Dobór komponentu"
              />
              <button
                type="button"
                onClick={() => updateLessonCategories(settings.lessonCategories.filter((_, j) => j !== i))}
                className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40 shrink-0"
                aria-label="Usuń kategorię"
              >✕</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => updateLessonCategories([...(settings.lessonCategories || []), ''])}
          className="mt-2 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full"
        >
          + Dodaj kategorię
        </button>
      </section>

      {/* === Integracja SharePoint === */}
      <section className="card">
        <h2 className="section-title">☁️ Integracja SharePoint</h2>

        <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
          ⚠️ <strong>Integracja jeszcze nieaktywna.</strong> Wymaga jednorazowej rejestracji
          aplikacji w Microsoft 365 (Entra ID). Wartości poniżej zapiszą się i zostaną użyte,
          gdy SharePoint zostanie podłączony.
        </div>

        <div className="mt-3">
          <label className="field-label">Podfolder docelowy w projekcie</label>
          <input
            type="text"
            className="field-input"
            value={settings.sharepointSubfolder}
            onChange={(e) => updateSubfolder(e.target.value)}
            placeholder="08. Notesy"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
            Raporty będą trafiać do tego podfolderu wewnątrz folderu projektu, np.{' '}
            <code className="text-[11px] bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">25-104 - BSH / {settings.sharepointSubfolder || '…'}</code>.
            Nazwa musi <strong>dokładnie</strong> odpowiadać folderowi w SharePoincie.
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Witryna</div>
            <div className="text-gray-800 dark:text-gray-100 font-medium">PROJEKTY</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">Zakres</div>
            <div className="text-gray-800 dark:text-gray-100 font-medium">Tylko nowe projekty</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
          Aplikacja łączy się wyłącznie z nowymi projektami w witrynie PROJEKTY. Starsze projekty
          z własnymi witrynami pozostają poza integracją (obsługa po staremu).
        </p>
      </section>

      {/* === E-mail zakupowca === */}
      <section className="card">
        <h2 className="section-title">📧 Domyślny e-mail zakupowca</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">
          Podpowiadany automatycznie w nowych reklamacjach. W konkretnym zgłoszeniu możesz go nadpisać.
        </p>
        <input
          type="email"
          inputMode="email"
          className="field-input"
          value={buyerEmail}
          onChange={(e) => updateBuyerEmail(e.target.value)}
          placeholder="zakupowiec@firma.pl"
        />
      </section>

      {/* === Pamięć urządzenia === */}
      <section className="card">
        <h2 className="section-title">💾 Pamięć urządzenia</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">
          Raporty i zdjęcia są przechowywane lokalnie. Tu widzisz, ile miejsca zajmują
          i czy przeglądarka chroni te dane przed automatycznym czyszczeniem.
        </p>

        {estimate ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700 dark:text-gray-200">
                Zajęte: <strong>{formatBytes(estimate.usage)}</strong>
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                z {formatBytes(estimate.quota)}{usagePct !== null ? ` (${usagePct}%)` : ''}
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={'h-full rounded-full transition-all ' + (usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-sure-blue')}
                style={{ width: `${usagePct ?? 0}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Informacja o pamięci niedostępna w tej przeglądarce.</p>
        )}

        <div className="mt-3">
          {persisted === true && (
            <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-500/40 rounded-lg px-3 py-2">
              ✓ Dane chronione — przeglądarka nie wyczyści ich automatycznie przy braku miejsca.
            </div>
          )}
          {persisted === false && (
            <div className="space-y-2">
              <div className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-500/40 rounded-lg px-3 py-2">
                ⚠️ Przeglądarka może wyczyścić dane przy braku miejsca na dysku.
                Włącz ochronę i regularnie rób „💾 Backup wszystko" ze strony głównej.
              </div>
              <button onClick={requestPersist} className="btn-secondary">
                🔒 Włącz ochronę danych
              </button>
            </div>
          )}
        </div>
      </section>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-2">
        ✓ Ustawienia zapisują się automatycznie na tym urządzeniu.
      </p>
    </div>
  )
}
