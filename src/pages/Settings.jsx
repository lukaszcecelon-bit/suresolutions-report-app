import { useState } from 'react'
import { loadSettings, saveSettings, getBuyerEmail, setBuyerEmailGlobal } from '../utils/settings.js'

// Globalne ustawienia aplikacji (route #/settings, wejście przez ⚙️ w nagłówku).
// Wszystko zapisuje się automatycznie do localStorage przy każdej zmianie —
// spójnie z resztą aplikacji (auto-save).
export default function Settings({ navigate }) {
  const [settings, setSettings] = useState(() => loadSettings())
  const [buyerEmail, setBuyerEmailState] = useState(() => getBuyerEmail())

  const updateSubfolder = (v) => {
    setSettings(saveSettings({ sharepointSubfolder: v }))
  }
  const updateBuyerEmail = (v) => {
    setBuyerEmailState(v)
    setBuyerEmailGlobal(v)
  }

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>

      <div>
        <h1 className="text-2xl font-bold text-sure-dark dark:text-gray-100">Ustawienia</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
          Zmiany zapisują się automatycznie. Ustawienia są lokalne — dotyczą tego urządzenia.
        </p>
      </div>

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

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-2">
        ✓ Ustawienia zapisują się automatycznie na tym urządzeniu.
      </p>
    </div>
  )
}
