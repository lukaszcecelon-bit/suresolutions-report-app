import { useMemo } from 'react'
import SuggestInput from './SuggestInput.jsx'
import { suggestAuthors, suggestProjectNames, suggestProjectNumbers, suggestMachineNames } from '../../utils/suggestions.js'

const TYPE_TITLES = {
  commissioning: 'Raport uruchomienia / obserwacji maszyny',
  service: 'Raport serwisu na obiekcie',
  prototype: 'Raport testów prototypu',
  satfat: 'Raport odbioru SAT / FAT',
}

const TYPE_ICONS = {
  commissioning: '▶',
  service: '🔧',
  prototype: '🧪',
  satfat: '📋',
}

// `requiredFields` (default: all) — which header fields are validated as required.
// `showErrors` (default: false) — only show red borders after user attempted a gated action.
export default function Header({
  header,
  onChange,
  reportType,
  requiredFields = ['reportNumber', 'projectName', 'machineName', 'date', 'author'],
  showErrors = false,
}) {
  const set = (k, v) => onChange({ ...header, [k]: v })
  const invalid = (k) => showErrors && requiredFields.includes(k) && !(header[k] || '').toString().trim()
  const labelCls = (k) => 'field-label ' + (requiredFields.includes(k) ? 'field-required' : '')
  const inputCls = (k) => 'field-input ' + (invalid(k) ? 'is-invalid' : '')

  // Źródła autouzupełniania liczą się z całego localStorage (loadAll + dedup).
  // Memoizujemy, żeby NIE przeliczać ich przy każdym renderze (czyli przy każdym
  // wciśnięciu klawisza w formularzu) — tylko raz na mount / przy zmianie projektu.
  const projectNameSug = useMemo(() => suggestProjectNames(), [])
  const projectNumberSug = useMemo(() => suggestProjectNumbers(), [])
  const machineNameSug = useMemo(() => suggestMachineNames(header.projectName), [header.projectName])
  const authorSug = useMemo(() => suggestAuthors(), [])

  // Raport serwisowy i uruchomieniowy: zamiast numeru raportu wpisuje się numer
  // projektu, a numer raportu generuje się automatycznie (RPT-/URU-{nr}-{data}).
  // Wartość auto jest liczona w updateHeader danej strony i trzymana w
  // header.reportNumber — tu tylko ją pokazujemy jako podgląd.
  // Wszystkie typy używające Header (serwis/uruchomienie/prototyp/SAT-FAT)
  // wpisują numer projektu → numer raportu liczony automatycznie (RPT-/URU-/
  // PRT-/FAT-/SAT-). Reklamacja ma własny formularz i nie korzysta z Header.
  const autoNumber = ['service', 'commissioning', 'prototype', 'satfat'].includes(reportType)

  return (
    <div className="space-y-3">
      {/* Context bar — type + readonly badge above the form */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <span className="text-base">{TYPE_ICONS[reportType] || '📋'}</span>
        <span className="font-medium">{TYPE_TITLES[reportType] || reportType}</span>
      </div>

      <div className="card">
        <h3 className="section-title no-rule">Nagłówek raportu</h3>

        {/* Long, primary identifiers — full width on mobile, two columns on desktop.
            min-w-0 on cells lets the inputs shrink instead of pushing the row
            past the container — important for iOS Safari where some input types
            (most notably type="date") have a wider intrinsic min-width. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {autoNumber ? (
            <div className="min-w-0">
              <label className="field-label field-required">Numer projektu</label>
              <SuggestInput
                type="text"
                className="field-input"
                placeholder="np. 2025-104"
                suggestions={projectNumberSug}
                value={header.projectNumber || ''}
                onChange={(e) => set('projectNumber', e.target.value)}
              />
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Nazwa raportu: <span className="font-mono text-sure-dark dark:text-gray-200">{header.reportNumber || '—'}</span>
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <label className={labelCls('reportNumber')}>Numer raportu</label>
              <input
                type="text"
                className={inputCls('reportNumber')}
                placeholder="np. RPT-2025-001"
                value={header.reportNumber || ''}
                onChange={(e) => set('reportNumber', e.target.value)}
              />
            </div>
          )}
          <div className="min-w-0">
            <label className={labelCls('projectName')}>Nazwa projektu</label>
            <SuggestInput
              type="text"
              className={inputCls('projectName')}
              suggestions={projectNameSug}
              value={header.projectName || ''}
              onChange={(e) => set('projectName', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 min-w-0">
            <label className={labelCls('machineName')}>Nazwa / numer maszyny</label>
            <SuggestInput
              type="text"
              className={inputCls('machineName')}
              suggestions={machineNameSug}
              value={header.machineName || ''}
              onChange={(e) => set('machineName', e.target.value)}
            />
          </div>
        </div>

        {/* Short fields — stacked on phones (iOS native date input is wider than
            it should be on narrow viewports), side-by-side on tablet+ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="min-w-0">
            <label className={labelCls('date')}>Data</label>
            <input
              type="date"
              className={inputCls('date')}
              value={header.date || ''}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <label className={labelCls('author')}>Autor</label>
            <SuggestInput
              type="text"
              className={inputCls('author')}
              suggestions={authorSug}
              value={header.author || ''}
              onChange={(e) => set('author', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
