import { useMemo, useState } from 'react'
import Header from '../common/Header.jsx'
import MediaUploader from '../common/MediaUploader.jsx'
import ToggleGroup from '../common/ToggleGroup.jsx'
import SectionNav from '../common/SectionNav.jsx'
import AutoSaveIndicator from '../common/AutoSaveIndicator.jsx'
import ReportActionBar, { LockBanner } from '../common/ReportActionBar.jsx'
import NotesList from '../common/NotesList.jsx'
import { MicTextarea } from '../common/VoiceMic.jsx'
import { getById, newId } from '../../utils/storage.js'
import { computeReportNumber } from '../../utils/reportNumber.js'
import { getDefaultAuthor, getLessonCategories, LESSON_STAGES } from '../../utils/settings.js'
import { useReportPage } from '../../utils/useReportPage.js'
import { buildLessonPackage, buildLessonPdf } from '../../utils/pdfGenerator.js'

// Istotność błędu (klucz zapisywany w danych; kolory jak w reszcie apki).
const SEVERITY_ITEMS = [
  { key: 'critical', label: 'Krytyczny', icon: '🔴', activeClass: 'bg-red-100 text-red-700 border-red-400 font-semibold dark:bg-red-900/40 dark:text-red-200 dark:border-red-500/50' },
  { key: 'major',    label: 'Poważny',   icon: '🟠', activeClass: 'bg-amber-100 text-amber-800 border-amber-400 font-semibold dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-500/50' },
  { key: 'minor',    label: 'Drobny',    icon: '⚪', activeClass: 'bg-gray-200 text-gray-700 border-gray-400 font-semibold dark:bg-gray-600 dark:text-gray-100 dark:border-gray-400/50' },
]

const SECTIONS = [
  { id: 'sec-header', label: 'Nagłówek' },
  { id: 'sec-a',      label: 'A. Kontekst' },
  { id: 'sec-b',      label: 'B. Opis błędu' },
  { id: 'sec-c',      label: 'C. Klasyfikacja' },
  { id: 'sec-d',      label: 'D. Skutek' },
  { id: 'sec-e',      label: 'E. Wnioski' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)
const nowISO = () => new Date().toISOString()

function defaultReport() {
  return {
    id: newId(),
    type: 'lesson',
    status: 'draft',
    createdAt: nowISO(),
    updatedAt: nowISO(),
    header: {
      projectNumber: '',   // numer projektu (wpisywany)
      reportNumber: '',    // auto: LL-{projectNumber}-{date}
      projectName: '',
      machineName: '',
      date: todayISO(),
      author: getDefaultAuthor(),
    },
    drawingNo: '',      // nr rysunku / DTR (opcjonalny)
    stage: '',          // etap, na którym wykryto błąd
    category: '',       // kategoria błędu (klasyfikacja rejestru)
    severity: '',       // istotność
    problem: '',        // opis błędu projektowego
    problemMedia: [],   // zdjęcia błędu
    impact: '',         // skutek / wpływ
    lessons: [],        // wnioski/rekomendacje — rekordy {id, text, media}
  }
}

export default function LessonReport({ navigate, reportId }) {
  const [report, setReport] = useState(() => {
    if (reportId) {
      const existing = getById(reportId)
      if (existing) return existing
    }
    return defaultReport()
  })

  const page = useReportPage({ report, setReport, buildPackage: buildLessonPackage, buildPdf: buildLessonPdf })
  const { confirm, locked } = page

  const categories = useMemo(() => [...getLessonCategories(), 'Inne'], [])

  // Nagłówek: po każdej zmianie przelicz numer raportu z numeru projektu + daty.
  const updateHeader = (h) => {
    setReport((r) => ({
      ...r,
      header: { ...h, reportNumber: computeReportNumber('LL', h.projectNumber, h.date, h.reportNumber) },
    }))
  }
  const setField = (k, v) => setReport((r) => ({ ...r, [k]: v }))

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>
        <AutoSaveIndicator savedAt={page.savedAt} />
      </div>

      <SectionNav sections={SECTIONS} report={report} />

      <LockBanner locked={locked} onUnlock={page.unlock} />

      <fieldset disabled={locked} className="space-y-4 min-w-0">

      <div id="sec-header">
        <Header header={report.header} onChange={updateHeader} reportType="lesson" />
      </div>

      <div id="sec-a" className="card">
        <h3 className="section-title">A. Kontekst</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="field-label">Etap, na którym wykryto błąd</label>
            <select
              className="field-input"
              value={report.stage || ''}
              onChange={(e) => setField('stage', e.target.value)}
            >
              <option value="">— wybierz —</option>
              {LESSON_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="field-label">Nr rysunku / DTR (opcjonalny)</label>
            <input
              type="text"
              className="field-input"
              placeholder="np. RYS-25-104-03"
              value={report.drawingNo || ''}
              onChange={(e) => setField('drawingNo', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div id="sec-b" className="card">
        <h3 className="section-title">B. Opis błędu projektowego</h3>
        <MicTextarea
          placeholder="Co konkretnie było źle zaprojektowane? Opisz błąd tak, aby konstruktor go zrozumiał bez dopytywania."
          value={report.problem}
          onChange={(e) => setField('problem', e.target.value)}
        />
        <div className="mt-3">
          <label className="field-label">Zdjęcia błędu (opcjonalne)</label>
          <MediaUploader
            photoOnly
            media={report.problemMedia || []}
            onChange={(m) => setField('problemMedia', m)}
          />
        </div>
      </div>

      <div id="sec-c" className="card">
        <h3 className="section-title">C. Klasyfikacja</h3>
        <div className="min-w-0">
          <label className="field-label field-required">Kategoria błędu</label>
          <select
            className="field-input"
            value={report.category || ''}
            onChange={(e) => setField('category', e.target.value)}
          >
            <option value="">— wybierz —</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Kategorie edytujesz w Ustawieniach. To ona (obok istotności) pozwala filtrować rejestr.
          </p>
        </div>
        <div className="mt-4">
          <label className="field-label">Istotność</label>
          <ToggleGroup
            items={SEVERITY_ITEMS}
            value={report.severity}
            onChange={(k) => setField('severity', k)}
          />
        </div>
      </div>

      <div id="sec-d" className="card">
        <h3 className="section-title">D. Skutek / wpływ</h3>
        <MicTextarea
          placeholder="Co ten błąd spowodował? (przestój, przeróbka, opóźnienie, koszt, ryzyko bezpieczeństwa…)"
          value={report.impact}
          onChange={(e) => setField('impact', e.target.value)}
        />
      </div>

      <div id="sec-e" className="card">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-sure-dark dark:text-gray-100 mb-0">E. Wnioski / rekomendacje dla konstrukcji</h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">{report.lessons.length}</span>
        </div>
        <NotesList
          items={report.lessons}
          onChange={(v) => setField('lessons', v)}
          confirm={confirm}
          addLabel="+ Dodaj wniosek"
          placeholder="Co zmienić w projekcie / procesie, żeby błąd się nie powtórzył?"
          emptyIcon="🎓"
          emptyTitle="Brak wniosków"
          emptyHint={'Kliknij „+ Dodaj wniosek" poniżej. Każdy wniosek to osobny wpis — możesz dodać zdjęcie i zmieniać kolejność (≡).'}
          removeConfirm="Usunąć ten wniosek?"
          newItemLabel="Nowy wniosek"
        />
      </div>

      </fieldset>

      <ReportActionBar page={page} status={report.status} navigate={navigate} />
    </div>
  )
}
