import { useEffect, useState } from 'react'
import { loadAll, remove } from '../utils/storage.js'
import { generateCommissioningPackage, generateServicePackage, generatePrototypePackage } from '../utils/pdfGenerator.js'

const TYPE_LABELS = {
  commissioning: 'Uruchomienie / obserwacja maszyny',
  service: 'Serwis na obiekcie',
  prototype: 'Testy prototypu / podzespołu',
}

const TYPE_ICONS = {
  commissioning: '▶',
  service: '🔧',
  prototype: '🧪',
}

export default function Home({ navigate }) {
  const [reports, setReports] = useState([])

  useEffect(() => {
    setReports(loadAll())
  }, [])

  const refresh = () => setReports(loadAll())

  const handleDelete = (id) => {
    if (!window.confirm('Usunąć ten raport? Tej operacji nie można cofnąć.')) return
    remove(id)
    refresh()
  }

  const handlePdf = async (r) => {
    try {
      if (r.type === 'commissioning') await generateCommissioningPackage(r)
      else if (r.type === 'service') await generateServicePackage(r)
      else if (r.type === 'prototype') await generatePrototypePackage(r)
      else alert('Pobieranie dla tego typu raportu zostanie dodane w kolejnej fazie.')
    } catch (e) {
      alert('Błąd generowania paczki: ' + e.message)
    }
  }

  const handleOpen = (r) => {
    if (r.type === 'commissioning') navigate(`commissioning/${r.id}`)
    else if (r.type === 'service') navigate(`service/${r.id}`)
    else if (r.type === 'prototype') navigate(`prototype/${r.id}`)
    else alert('Ten typ raportu zostanie dodany w kolejnej fazie.')
  }

  return (
    <div className="space-y-6">
      <section>
        <button
          onClick={() => navigate('new')}
          className="w-full btn-primary text-lg py-6 shadow-sm"
        >
          + Nowy raport
        </button>
      </section>

      <section>
        <h2 className="section-title">Zapisane raporty</h2>
        {reports.length === 0 ? (
          <div className="card text-center text-gray-500">
            Brak zapisanych raportów. Kliknij <span className="font-medium">„+ Nowy raport"</span> aby zacząć.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{TYPE_ICONS[r.type] || '📄'}</span>
                    <span className="truncate">{TYPE_LABELS[r.type] || r.type}</span>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full border"
                      style={{
                        borderColor: r.status === 'completed' ? '#10B981' : '#F59E0B',
                        color: r.status === 'completed' ? '#047857' : '#B45309',
                        background: r.status === 'completed' ? '#ECFDF5' : '#FFFBEB',
                      }}>
                      {r.status === 'completed' ? 'Ukończony' : 'Roboczy'}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-sure-dark">
                    {r.header?.reportNumber || '(brak nr)'} · {r.header?.projectName || '(brak projektu)'}
                  </div>
                  <div className="text-xs text-gray-500">
                    Maszyna: {r.header?.machineName || '—'} · Data: {r.header?.date || '—'} · Autor: {r.header?.author || '—'}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button className="btn-secondary text-sm py-2 px-3" onClick={() => handleOpen(r)}>Otwórz</button>
                  <button className="btn-secondary text-sm py-2 px-3" onClick={() => handlePdf(r)}>📦 Pobierz</button>
                  <button className="btn-danger text-sm py-2 px-3" onClick={() => handleDelete(r.id)}>Usuń</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
