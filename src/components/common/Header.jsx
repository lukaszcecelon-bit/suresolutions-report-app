const STOPS_TYPE_LABELS = {
  commissioning: 'Raport uruchomienia / obserwacji maszyny',
  service: 'Raport serwisu na obiekcie',
  prototype: 'Raport testów prototypu',
}

export default function Header({ header, onChange, reportType }) {
  const set = (k, v) => onChange({ ...header, [k]: v })

  return (
    <div className="card">
      <h3 className="section-title">Nagłówek raportu</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="field-label">Numer raportu</label>
          <input
            type="text"
            className="field-input"
            placeholder="np. RPT-2025-001"
            value={header.reportNumber || ''}
            onChange={(e) => set('reportNumber', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Data</label>
          <input
            type="date"
            className="field-input"
            value={header.date || ''}
            onChange={(e) => set('date', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Nazwa projektu</label>
          <input
            type="text"
            className="field-input"
            value={header.projectName || ''}
            onChange={(e) => set('projectName', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Nazwa / numer maszyny</label>
          <input
            type="text"
            className="field-input"
            value={header.machineName || ''}
            onChange={(e) => set('machineName', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Imię i nazwisko autora</label>
          <input
            type="text"
            className="field-input"
            value={header.author || ''}
            onChange={(e) => set('author', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Typ raportu</label>
          <input
            type="text"
            className="field-input bg-gray-50"
            readOnly
            value={STOPS_TYPE_LABELS[reportType] || reportType}
          />
        </div>
      </div>
    </div>
  )
}
