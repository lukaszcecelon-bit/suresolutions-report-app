import { resetOnboarding } from '../components/common/OnboardingTour.jsx'

// Stała, zawsze dostępna pomoc (route #/help, wejście przez „?" w nagłówku).
// Różni się od OnboardingTour (jednorazowy modal na start) — to materiał
// referencyjny, do którego user może wrócić w dowolnym momencie.

// Typy raportów — „co do czego". Ikony spójne z Home (TYPE_ICONS).
const REPORT_TYPES = [
  {
    icon: '▶',
    name: 'Uruchomienie / obserwacja maszyny',
    desc: 'Live-logger zatrzymań podczas rozruchu. Startujesz sesję, a appka mierzy czas pracy i przestojów; przy każdym zatrzymaniu notujesz powód i komentarz. Na koniec statystyki i wnioski.',
  },
  {
    icon: '🔧',
    name: 'Serwis na obiekcie',
    desc: 'Raport z wizyty serwisowej u klienta: wykonane czynności, elementy do wymiany, obserwacje własne, rekomendacje. Liczy łączny czas wizyty (przyjazd–odjazd) i kto odebrał prace.',
  },
  {
    icon: '🧪',
    name: 'Testy prototypu / podzespołu',
    desc: 'Iteracyjne testy konstrukcji: warunki i parametry, punkty kontrolne z wynikiem (OK / NOK / warunkowo), ocena ogólna i decyzja — wdrożyć, poprawić w kolejnej iteracji, albo odrzucić.',
  },
  {
    icon: '📋',
    name: 'SAT / FAT — odbiór maszyny',
    desc: 'Protokół odbioru u producenta (FAT) lub na obiekcie (SAT): uczestnicy obu stron, testy odbiorowe, lista usterek (punch list) z priorytetami, status końcowy i miejsce na podpisy stron.',
  },
  {
    icon: '🚩',
    name: 'Reklamacja / zgłoszenie wady',
    desc: 'Szybkie zgłoszenie wady części do dostawcy: zdjęcie wady, kategoria, opis, znacznik „blokuje montaż". Appka przygotowuje paczkę i gotowy mail do zakupowca.',
  },
]

// Sekcje „jak to działa" — krótkie, skanowalne.
const HOW_IT_WORKS = [
  {
    icon: '✍️',
    title: 'Tworzenie raportu',
    body: 'Kliknij „+ Nowy raport" i wybierz typ. Wypełniaj sekcje po kolei — wszystko zapisuje się automatycznie (widzisz „Zapisano”). Możesz wyjść i wrócić: raport czeka na liście na stronie głównej.',
  },
  {
    icon: '📷',
    title: 'Zdjęcia i adnotacje',
    body: 'Dodaj zdjęcie aparatem telefonu. Tap w miniaturę otwiera edytor — narysuj strzałkę, kółko albo dopisz tekst, żeby wskazać problem. Adnotacje możesz później przesuwać, skalować i usuwać. W PDF zdjęcia trafiają jako miniaturki przy opisie, a pełne pliki w paczce ZIP.',
  },
  {
    icon: '🎤',
    title: 'Dyktowanie głosem',
    body: 'W dłuższych polach (uwagi, wnioski, opis czynności) jest przycisk 🎤. Wciśnij, mów po polsku — appka wpisze tekst za Ciebie. Wygodne w rękawicach albo gdy masz zajęte ręce.',
  },
  {
    icon: '≡',
    title: 'Kolejność wpisów',
    body: 'Listy (czynności, testy, usterki, punkty kontrolne…) przeciągasz za uchwyt ≡, żeby zmienić ich kolejność. Na telefonie przytrzymaj chwilę uchwyt, zanim zaczniesz przeciągać.',
  },
  {
    icon: '📦',
    title: 'Pobierz paczkę (PDF + media)',
    body: 'Generuje gotowy raport PDF razem ze zdjęciami w oryginalnej rozdzielczości — wszystko w jednym pliku ZIP. Na komputerze miniaturki w PDF są klikalne i otwierają pełne zdjęcie po rozpakowaniu paczki.',
  },
  {
    icon: '🔁',
    title: 'Przenoszenie między urządzeniami',
    body: 'Bez chmury — Ty decydujesz, gdzie trafia plik. „📤 Wyślij” udostępnia paczkę przez systemowe menu (AirDrop / Mail / OneDrive). „💾 Pobierz plik” zapisuje lokalnie. Na stronie głównej: „📥 Importuj raport” wczytuje paczkę z innego urządzenia, a „💾 Backup wszystko” pakuje wszystkie raporty naraz.',
  },
  {
    icon: '🌗',
    title: 'Tryb jasny / ciemny',
    body: 'Przełącznik ☀️/🌙 w prawym górnym rogu. Domyślnie dopasowuje się do ustawień systemu, ale możesz wymusić swój wybór.',
  },
  {
    icon: '🔄',
    title: 'Aktualizacje aplikacji',
    body: 'Numer wersji widzisz w prawym górnym rogu. Kliknij go, żeby ręcznie sprawdzić aktualizację. Gdy jest nowa wersja, pojawi się baner „Nowa wersja” — kliknij „Odśwież”, żeby ją zainstalować.',
  },
  {
    icon: '📲',
    title: 'Instalacja na telefonie',
    body: 'Otwórz w Safari (iPhone) lub Chrome (Android) → menu przeglądarki → „Dodaj do ekranu głównego”. Aplikacja zachowuje się wtedy jak natywna i działa offline.',
  },
]

export default function Help({ navigate }) {
  const replayTour = () => {
    resetOnboarding()
    // Tour sprawdza localStorage tylko przy starcie App — wracamy na Home
    // i przeładowujemy, żeby pokazał się od nowa.
    window.location.hash = ''
    window.location.reload()
  }

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => navigate('')} className="text-sure-blue text-sm">← Strona główna</button>

      <div>
        <h1 className="text-2xl font-bold text-sure-dark dark:text-gray-100">Pomoc</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
          Raporty SURE to aplikacja do tworzenia raportów inżynierskich w terenie. Działa
          w całości na Twoim urządzeniu — <strong>offline, bez logowania, bez chmury</strong>.
          Poniżej w skrócie: co do czego i jak to działa.
        </p>
      </div>

      <section className="card">
        <h2 className="section-title">📋 Typy raportów</h2>
        <div className="space-y-3">
          {REPORT_TYPES.map((t) => (
            <div key={t.name} className="flex gap-3">
              <div className="text-2xl leading-none w-8 shrink-0 text-center">{t.icon}</div>
              <div className="min-w-0">
                <div className="font-semibold text-sure-dark dark:text-gray-100">{t.name}</div>
                <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-0.5">{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">⚙️ Jak to działa</h2>
        <div className="space-y-3">
          {HOW_IT_WORKS.map((s) => (
            <div key={s.title} className="flex gap-3">
              <div className="text-xl leading-none w-8 shrink-0 text-center">{s.icon}</div>
              <div className="min-w-0">
                <div className="font-semibold text-sure-dark dark:text-gray-100">{s.title}</div>
                <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-0.5">{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-900/20">
        <h2 className="section-title">🔒 Twoje dane i prywatność</h2>
        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
          Wszystkie raporty i zdjęcia są przechowywane <strong>tylko na tym urządzeniu</strong> —
          nic nie jest wysyłane do internetu. To znaczy też, że <strong>wyczyszczenie danych
          przeglądarki usunie raporty</strong>. Dla ważnych raportów rób kopię: „💾 Backup wszystko”
          na stronie głównej albo „💾 Pobierz plik” w pojedynczym raporcie.
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">👋 Przewodnik powitalny</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">
          Krótki przewodnik, który pokazał się przy pierwszym uruchomieniu. Możesz go obejrzeć ponownie.
        </p>
        <button onClick={replayTour} className="btn-secondary">
          ▶ Pokaż przewodnik ponownie
        </button>
      </section>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pt-2">
        SureSolutions — aplikacja raportowa. Pytania i pomysły zgłaszaj wewnętrznie.
      </p>
    </div>
  )
}
