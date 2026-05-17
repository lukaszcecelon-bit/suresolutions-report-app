export default function EmptyState({ icon = '📋', title, hint }) {
  return (
    <div className="text-center py-6 px-4 rounded-lg border border-dashed border-gray-300 bg-gray-50">
      <div className="text-3xl opacity-60 mb-2">{icon}</div>
      {title && <div className="text-sm font-medium text-gray-700">{title}</div>}
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  )
}
