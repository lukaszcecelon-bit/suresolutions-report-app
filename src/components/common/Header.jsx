const TYPE_TITLES = {
  commissioning: 'Raport uruchomienia / obserwacji maszyny',
  service: 'Raport serwisu na obiekcie',
  prototype: 'Raport testów prototypu',
}

const TYPE_ICONS = {
  commissioning: '▶',
  service: '🔧',
  prototype: '🧪',
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

  return (
    <div className="space-y-3">
      {/* Context bar — type + readonly badge above the form */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
        <span className="text-base">{TYPE_ICONS[reportType] || '📋'}</span>
        <span className="font-medium">{TYPE_TITLES[reportType] || reportType}</span>
      </div>

      <div className="card">
        <h3 className="section-title no-rule">Nagłówek raportu</h3>

        {/* Long, primary identifiers — full width on mobile, two columns on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls('reportNumber')}>Numer raportu</label>
            <input
              type="text"
              className={inputCls('reportNumber')}
              placeholder="np. RPT-2025-001"
              value={header.reportNumber || ''}
              onChange={(e) => set('reportNumber', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls('projectName')}>Nazwa projektu</label>
            <input
              type="text"
              className={inputCls('projectName')}
              value={header.projectName || ''}
              onChange={(e) => set('projectName', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls('machineName')}>Nazwa / numer maszyny</label>
            <input
              type="text"
              className={inputCls('machineName')}
              value={header.machineName || ''}
              onChange={(e) => set('machineName', e.target.value)}
            />
          </div>
        </div>

        {/* Short fields — narrower side-by-side row */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className={labelCls('date')}>Data</label>
            <input
              type="date"
              className={inputCls('date')}
              value={header.date || ''}
              onChange={(e) => set('date', e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls('author')}>Autor</label>
            <input
              type="text"
              className={inputCls('author')}
              value={header.author || ''}
              onChange={(e) => set('author', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
