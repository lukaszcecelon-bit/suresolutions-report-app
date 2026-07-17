// Dolny pasek nawigacji (v0.42) — wzorzec zainstalowanej aplikacji mobilnej:
// główne ekrany zawsze pod kciukiem. Widoczny TYLKO na ekranach najwyższego
// poziomu (Start / wybór typu / Raporty / Pomoc / Ustawienia). Formularze
// raportów go CHOWAJĄ — to pełnoekranowe zadanie „drill-down" z własnym
// „← Strona główna", a przy klawiaturze każdy piksel wysokości się liczy.
//
// padding-bottom: env(safe-area-inset-bottom) — na iPhone pasek nie wjeżdża
// pod gest home (wymaga viewport-fit=cover w index.html — jest od dawna).

const TABS = [
  { key: 'home',    hash: '',        label: 'Start',   icon: '🏠' },
  { key: 'reports', hash: 'reports', label: 'Raporty', icon: '🗂' },
  { key: 'help',    hash: 'help',    label: 'Pomoc',   icon: '❓' },
]

// Trasy, na których pasek jest widoczny (App dodaje wtedy padding na dole).
export const TAB_ROUTES = ['home', 'new', 'reports', 'help', 'settings']

export default function TabBar({ routeName, navigate }) {
  // Ekran wyboru typu (#/new) to przedłużenie akcji ze Startu.
  const active = routeName === 'new' ? 'home' : routeName

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Nawigacja główna"
    >
      <div className="max-w-5xl mx-auto grid grid-cols-3">
        {TABS.map((t) => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.hash)}
              className={
                'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ' +
                (isActive
                  ? 'text-sure-blue'
                  : 'text-gray-500 dark:text-gray-400 hover:text-sure-blue')
              }
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={'text-xl leading-none ' + (isActive ? '' : 'grayscale opacity-70')} aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
