import { Component } from 'react'

// Globalna siatka bezpieczeństwa renderowania. Bez niej dowolny wyjątek
// w komponencie = trwały biały ekran (React odmontowuje całe drzewo).
// Klasowy komponent — React nie ma hookowego odpowiednika componentDidCatch.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary złapał wyjątek renderowania:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error?.message || String(this.state.error)
    return (
      <div className="min-h-full flex items-center justify-center p-6 bg-gray-100 dark:bg-gray-900">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold text-sure-dark dark:text-gray-100">Coś poszło nie tak</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
            Aplikacja napotkała nieoczekiwany błąd. <strong>Twoje raporty są bezpieczne</strong> —
            zapisują się lokalnie na bieżąco podczas edycji.
          </p>
          <div className="text-xs text-left text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 font-mono break-all max-h-24 overflow-auto">
            {message}
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => window.location.reload()} className="btn-primary w-full">
              ⟳ Przeładuj aplikację
            </button>
            <button
              onClick={() => { window.location.hash = ''; window.location.reload() }}
              className="btn-secondary w-full"
            >
              ← Wróć do strony głównej
            </button>
          </div>
        </div>
      </div>
    )
  }
}
