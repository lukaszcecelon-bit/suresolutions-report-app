import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Reusable sortable list. Daje render-prop API:
//   <SortableList items=... onReorder=... getId={(x) => x.id}>
//     {(item, dragHandle, i) => <div>{dragHandle} ... </div>}
//   </SortableList>
//
// `dragHandle` to gotowy do umieszczenia button — chwytasz nim element żeby
// przeciągnąć. Na mobile wymaga 200ms przytrzymania, żeby nie kolidować ze
// scrollowaniem strony. Na desktopie wystarczy poruszyć kursorem 5px.
//
// SortableList nie owija dzieci w żaden wrapper — kolejność/spacing zostaje
// w gestii caller'a (zazwyczaj `<div className="space-y-3">` na zewnątrz).
export default function SortableList({ items, onReorder, getId, children }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = (e) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => getId(i) === active.id)
    const newIndex = items.findIndex((i) => getId(i) === over.id)
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(items, oldIndex, newIndex))
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map(getId)} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <SortableItem key={getId(item)} id={getId(item)}>
            {(dragHandle) => children(item, dragHandle, i)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
    position: isDragging ? 'relative' : undefined,
  }

  // Drag handle to dedykowany przycisk. Click w niego nie robi nic
  // (brak onClick), ale {...listeners} przechwytuje pointer/touch events
  // i inicjuje drag. Reszta kontentu w wierszu (inputy, ✕) działa normalnie
  // bo te listenery są tylko na samym handle'u.
  const dragHandle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none shrink-0 w-7 h-7 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
      aria-label="Przeciągnij aby zmienić kolejność"
      title="Przeciągnij aby zmienić kolejność (na mobile przytrzymaj 200ms)"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="4" cy="3" r="1.3" />
        <circle cx="10" cy="3" r="1.3" />
        <circle cx="4" cy="7" r="1.3" />
        <circle cx="10" cy="7" r="1.3" />
        <circle cx="4" cy="11" r="1.3" />
        <circle cx="10" cy="11" r="1.3" />
      </svg>
    </button>
  )

  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandle)}
    </div>
  )
}
