export default function EmptyState({ icon = '📋', title, hint, children }) {
  return (
    <div className="text-center py-6 px-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/30">
      <div className="text-3xl opacity-60 mb-2">{icon}</div>
      {title && <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{title}</div>}
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
      {children && <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">{children}</div>}
    </div>
  )
}
