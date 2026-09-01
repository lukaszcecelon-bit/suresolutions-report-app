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
  {
    icon: '🎓',
    name: 'Ticket z montażu (Lesson Learned)',
    desc: 'Zgłoszenie z hali do konstrukcji: co było źle zaprojektowane, jaki to miało skutek i jaki z tego wniosek na przyszłość. Nagłówek jest chudy — numer projektu i opcjonalnie numery części — żeby dało się to wypełnić w biegu. Wszystkie tickety eksportujesz jednym kliknięciem do arkusza Excel: to filtrowalny rejestr.',
  },
]

// Sekcje „jak to działa" — krótkie, skanowalne.
const HOW_IT_WORKS = [
  {
    icon: '🧭',
    title: 'Nawigacja i strefy',
    body: 'Dolny pasek: Start (szybkie akcje i „kontynuuj ostatni”), 🗂 Raporty (pełna lista z wyszukiwarką i filtrami), Pomoc. Typy raportów dzielą się na dwie strefy: 🏢 Dla klienta (serwis, SAT/FAT, uruchomienie — niebieski akcent) i 🔒 Wewnętrzne (prototyp, ticket z montażu, reklamacja — fioletowy).',
  },
  {
    icon: '✍️',
    title: 'Tworzenie raportu',
    body: 'Kliknij „+ Nowy raport" i wybierz typ. Wypełniaj sekcje po kolei — wszystko zapisuje się automatycznie (widzisz „Zapisano”). Możesz wyjść i wrócić: raport czeka w zakładce 🗂 Raporty na dolnym pasku.',
  },
  {
    icon: '⌨',
    title: 'Uruchomienie bez stopera (awaryjnie)',
    body: 'Domyślnie sesję uruchomienia mierzy appka: START, zatrzymania na żywo, koniec sesji. Gdy się nie da — telefon padł, obserwację prowadziłeś na kartce — pod przyciskiem START jest mały kafelek „⌨ Wypełnij ręcznie". Wtedy godziny pracy maszyny i wszystkie zatrzymania wpisujesz z ręki, a raport dostaje adnotację „wypełniony ręcznie”. Godziny sesji możesz też poprawić w podsumowaniu każdego raportu.',
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
    icon: '👁',
    title: 'Podgląd, PDF i paczka ZIP',
    body: '„👁 Podgląd” pokazuje gotowy raport w aplikacji (bez pobierania). „💾 Zapisz PDF na urządzenie” zapisuje sam raport (lekki, otwierany od razu — najlepszy do wysyłki). „📦 ZIP” dokłada wszystkie zdjęcia w oryginalnej rozdzielczości. Na telefonie zamiast „Zapisz” pojawia się „📲 Udostępnij” — wysyła plik wprost przez systemowe okno (Teams / Mail / Pliki).',
  },
  {
    icon: '🔁',
    title: 'Wysyłka i przenoszenie',
    body: 'Na telefonie: „📲 Udostępnij PDF” → systemowe okno (Mail / Pliki / Teams). Na komputerze: „✉️ Wyślij mailem” pobiera PDF i otwiera pocztę z tematem (załącz pobrany plik). „🔄 Przenieś na inne urządzenie” daje PDF z zaszytymi danymi: wygląda i otwiera się jak zwykły raport, ale druga osoba może go wczytać z powrotem do aplikacji i edytować — w zakładce 🗂 Raporty „📥 Wczytaj raport z pliku”. Dlatego do przekazywania raportu między telefonem a komputerem (albo między ludźmi) używaj TEGO przycisku — zwykły wydruk PDF danych nie niesie. Ten plik jest celowo lekki: zdjęcia idą w rozdzielczości raportu (tej samej, którą widać w PDF), a wideo zostaje na urządzeniu źródłowym — dzięki temu mieści się w mailu. Aplikacja pokazuje rozmiar przy tworzeniu pliku. Pełne oryginały zdjęć i wideo daje „📦 ZIP”, a całą bazę „💾 Backup wszystko”.',
  },
  {
    icon: '📤',
    title: 'Nie widzę Teams w oknie udostępniania (iPhone)',
    body: 'Znany objaw na iPhonie, sprawdzony w terenie: przy udostępnianiu wprost z aplikacji Teams nie pojawia się na liście (Outlook i OneDrive owszem), ale przy udostępnianiu tego samego pliku Z APLIKACJI PLIKI już jest. Rozszerzenie Teamsa przyjmuje plik leżący na dysku, a nie podany wprost z przeglądarki. DZIAŁAJĄCA DROGA: zapisz plik na telefonie („💾 Zapisz PDF na urządzenie”, a dla pliku z danymi „💾 Zapisz do Plików” pod „Przenieś na inne urządzenie”) → otwórz aplikację Pliki → tam Udostępnij → Teams. Na Androidzie i na komputerze udostępnianie do Teams działa wprost, bez tego objazdu. Wysyłka Outlookiem działa na iPhonie normalnie, wprost z aplikacji. Warto też sprawdzić: rząd ikon w oknie udostępniania przewija się do końca w prawo → „Więcej” pozwala włączyć ukryte aplikacje. Komunikat „Nie można przekazać pliku” w samym Teams to już kwestia OneDrive/M365, nie aplikacji.',
  },
  {
    icon: '🌗',
    title: 'Tryb jasny / ciemny',
    body: 'Przełącznik ☀️/🌙 w prawym górnym rogu. Domyślnie dopasowuje się do ustawień systemu, ale możesz wymusić swój wybór.',
  },
  {
    icon: '🔄',
    title: 'Aktualizacje aplikacji',
    body: 'Numer wersji widzisz w prawym górnym rogu. Kliknij go, żeby ręcznie sprawdzić aktualizację — gdy jest nowa, pojawi się baner „Nowa wersja”, kliknij „Odśwież”. Jeśli na telefonie (iPhone) numer się nie zmienia mimo sprawdzania: po kliknięciu wersji potwierdź „Wymuś odświeżenie” — to pobierze świeżą wersję z sieci (raporty zostają). Gdy i to nie pomoże, zamknij aplikację całkowicie (przesuń w górę z przełącznika aplikacji) i otwórz ponownie — iOS potrafi trzymać starą wersję, dopóki appka działa w tle.',
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

      <section className="card border-sky-300 dark:border-sky-500/40 bg-sky-50/60 dark:bg-sky-900/20">
        <h2 className="section-title">📨 Wysyłka do Teams — znane problemy</h2>
        <div className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed space-y-2">
          <p>
            Jeśli przy wysyłaniu pliku do Teams na iPhone widzisz błąd
            <strong> „Nie można przekazać pliku”</strong> — to problem po stronie
            <strong> Teams / Microsoft 365</strong>, nie aplikacji. Teams wrzuca pliki z czatu
            do Twojego <strong>OneDrive</strong>; jeśli OneDrive nie działa lub nie masz licencji,
            wgrywanie się nie powiedzie.
          </p>
          <p className="font-medium">Co zrobić:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Sprawdź OneDrive (onedrive.com) — czy działa i nie jest pełny.</li>
            <li>Spróbuj wysłać ten sam plik na <strong>kanał</strong> zespołu (pliki kanału idą do SharePointa) — jeśli tam działa, problemem jest OneDrive.</li>
            <li>Alternatywa, która działa zawsze: <strong>wyślij PDF mailem</strong> (Outlook) albo wrzuć na OneDrive i wklej link w Teams.</li>
            <li>Teams bywa też ukryty w oknie udostępniania iOS — przewiń ikony i dotknij „Więcej”.</li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            W razie wątpliwości zgłoś adminowi M365 sprawdzenie licencji OneDrive i polityki plików w Teams.
          </p>
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
