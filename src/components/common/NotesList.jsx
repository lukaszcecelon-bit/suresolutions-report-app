import EmptyState from './EmptyState.jsx'
import SortableList from './SortableList.jsx'
import MediaUploader from './MediaUploader.jsx'
import { MicTextarea } from './VoiceMic.jsx'
import { newId } from '../../utils/storage.js'

// Lista powtarzalnych wpisów { id, text, media } z przyciskiem „+ Dodaj",
// usuwaniem, zmianą kolejności (≡) i opcjonalnym zdjęciem. Wspólny wzorzec dla
// obserwacji i rekomendacji (serwis) oraz obserwacji i wniosków (uruchomienie).
//
// `items` — tablica rekordów; `onChange(nextArray)` — zapis nowej tablicy
// (rodzic robi setReport). `confirm` — z useReportPage (potwierdzenie usunięcia).
export default function NotesList({
  items,
  onChange,
  confirm,
  addLabel,
  placeholder,
  emptyIcon = '📝',
  emptyTitle,
  emptyHint,
  removeConfirm = 'Usunąć ten wpis?',
  newItemLabel = 'Nowy wpis',
  withMedia = true,
}) {
  const list = Array.isArray(items) ? items : []

  const add = () => onChange([...list, { id: newId(), text: '', media: [] }])
  const update = (id, patch) => onChange(list.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  const remove = async (id) => {
    if (confirm && !(await confirm(removeConfirm, { variant: 'danger', confirmLabel: 'Usuń' }))) return
    onChange(list.filter((o) => o.id !== id))
  }

  return (
    <div className="space-y-3">
      {list.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} hint={emptyHint} />
      ) : (
        <SortableList items={list} onReorder={onChange} getId={(o) => o.id}>
          {(o, dragHandle, i) => (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-700/40">
              <div className="flex items-center gap-2">
                {dragHandle}
                <span className="index-badge">{i + 1}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">
                  {o.text ? o.text.slice(0, 60) : newItemLabel}
                </span>
                <button
                  onClick={() => remove(o.id)}
                  className="btn-icon bg-red-600 hover:bg-red-700 focus:ring-red-500/40"
                  aria-label="Usuń wpis"
                >✕</button>
              </div>
              <MicTextarea
                placeholder={placeholder}
                value={o.text}
                onChange={(e) => update(o.id, { text: e.target.value })}
              />
              {withMedia && (
                <div>
                  <label className="field-label">Zdjęcia (opcjonalne)</label>
                  <MediaUploader
                    photoOnly
                    media={o.media || []}
                    onChange={(m) => update(o.id, { media: m })}
                  />
                </div>
              )}
            </div>
          )}
        </SortableList>
      )}
      <button
        onClick={add}
        className="mt-3 btn-sm bg-white text-sure-dark border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-600 w-full"
      >
        {addLabel}
      </button>
    </div>
  )
}
