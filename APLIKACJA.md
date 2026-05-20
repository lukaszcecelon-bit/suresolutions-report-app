# Raporty SURE — pełna dokumentacja

Aplikacja webowa (PWA) do tworzenia ustrukturyzowanych raportów technicznych
z testów, serwisów, uruchomień i odbiorów maszyn. Zaprojektowana pod codzienną
pracę konstruktora, serwisanta i właściciela małej firmy inżynierskiej.

**Live:** https://lukaszcecelon-bit.github.io/suresolutions-report-app/
**Repo:** https://github.com/lukaszcecelon-bit/suresolutions-report-app
**Aktualna wersja:** v0.9

---

## Spis treści

1. [Cel i kontekst](#cel-i-kontekst)
2. [Główne funkcjonalności](#główne-funkcjonalności)
3. [Architektura i stack techniczny](#architektura-i-stack-techniczny)
4. [Struktura projektu](#struktura-projektu)
5. [Przechowywanie danych](#przechowywanie-danych)
6. [Generowanie paczki raportu](#generowanie-paczki-raportu)
7. [PWA, offline i aktualizacje](#pwa-offline-i-aktualizacje)
8. [Hosting i CI/CD](#hosting-i-cicd)
9. [UX, motyw i dostępność](#ux-motyw-i-dostępność)
10. [Optymalizacje wydajności](#optymalizacje-wydajności)
11. [Limity i ograniczenia](#limity-i-ograniczenia)
12. [Historia wersji](#historia-wersji)
13. [Potencjalne ulepszenia](#potencjalne-ulepszenia)
14. [Plan rozwoju](#plan-rozwoju)

---

## Cel i kontekst

Apka rozwiązuje konkretny ból zespołu firmy SureSolutions: **tworzenie raportów
po wizytach u klienta, uruchomieniach maszyn, testach prototypów i odbiorach
FAT/SAT zajmowało znacznie więcej czasu niż sama praca techniczna**. Wcześniejszy
proces (notatki odręczne → Word → wklejanie zdjęć → ręczne tworzenie tabelek)
jest żmudny, podatny na pominięcia i odbiega standardem od oczekiwań klienta.

Cele projektu:

- **Skrócić czas raportowania** z ~30 min do ~5 min na parkingu po wizycie
- **Ujednolicić wygląd raportów** wychodzących do klientów
- **Zachować pełną prywatność danych** — żadnych serwerów, żadnego logowania
- **Działać na hali bez sygnału** — offline, na telefonie w rękawicach
- **Zero kosztów utrzymania** — brak subskrypcji, brak hostingu, brak SaaS

Apka jest celowo **wąsko wyspecjalizowana** pod 4 typy dokumentów, ale każdy
typ jest dopracowany pod realny workflow inżyniera.

---

## Główne funkcjonalności

### Cztery typy raportów dopasowane do realnej pracy

#### 1. Raport uruchomienia / obserwacji maszyny (flagowy live-logger)

Live-logging pracy maszyny w czasie rzeczywistym z timerem. Trzy fazy:

- **Faza 1: Start** — uzupełniasz nagłówek (numer raportu, projekt, maszyna,
  data, autor), klikasz duży zielony przycisk `▶ START MASZYNY`
- **Faza 2: Logowanie na żywo** — timer pracy maszyny stale widoczny u góry
  ekranu. Duży czerwony przycisk `⏸ ZATRZYMANIE MASZYNY` otwiera modal:
  godzina zatrzymania (auto), powód z dropdownu (Zacięcie, Błąd programu,
  Alarm, Regulacja, Awaria mechaniczna, Inne), komentarz, zdjęcie/wideo.
  Klikasz „Zapisz i wznów" → maszyna znowu pracuje. Apka automatycznie liczy
  czas trwania każdego zatrzymania.
- **Faza 3: Podsumowanie** — `⏹ STOP — ZAKOŃCZ SESJĘ` → apka generuje
  statystyki (całkowity czas pracy, liczba zatrzymań, łączny czas przestojów,
  najdłuższe zatrzymanie). Dodajesz obserwacje, wnioski, ewentualne zdjęcia
  ogólne. Pobierasz paczkę.

#### 2. Raport serwisu na obiekcie

Wizyta serwisowa u klienta z 7 sekcjami:

- **A. Dane wizyty** — klient, lokalizacja, godziny przyjazdu/odjazdu
- **B. Wykonane czynności** — dynamiczna lista, każda z kategorią
  (Mechanika/Elektryka/Pneumatyka/Hydraulika/Software/Inne) + opisem + zdjęciami.
  **Drag-to-reorder** przez chwyt `≡` (od v0.8).
- **C. Elementy do wymiany** — lista z nazwą, nr katalogowym, priorytetem
  (🔴 Pilne / 🟡 Planowe / 🟢 Obserwacja), komentarzem. **Drag-to-reorder**.
- **D. Obserwacje własne** — wolny tekst z voice-to-text
- **E. Rekomendacje** — wolny tekst z voice-to-text
- **F. Status wizyty** — Zakończona / Wymaga follow-up / Oczekuje na części
- **G. Dokumentacja fotograficzna ogólna**

#### 3. Raport testów prototypu / podzespołu

Iteracyjne testy z punktami kontrolnymi, 6 sekcji:

- **A. Informacje o teście** — testowany podzespół, numer iteracji, metoda
  wytworzenia próbki (Druk 3D / CNC / Inne), cel testu
- **B. Warunki testu** — opis setupu, parametry (klucz → wartość, do 10 par)
- **C. Wyniki testu** — punkty kontrolne z toggle wyniku (✓ OK / ✗ NOK /
  ~ Warunkowo), komentarzem, zdjęciami. **Drag-to-reorder**. Ogólna ocena testu.
- **D. Obserwacje i wnioski**
- **E. Decyzja** — Wdrożyć / Poprawki → kolejna iteracja / Odrzucić,
  z opisem dalszych kroków
- **F. Dokumentacja fotograficzna ogólna**

#### 4. Raport SAT / FAT — odbiór maszyny (od v0.6)

Live-report do tworzenia w terenie podczas odbioru maszyny. Jeden komponent
obsługuje oba scenariusze przez toggle:
- **🏭 FAT** (Factory Acceptance Test) — odbiór u producenta przed wysyłką
- **🏗️ SAT** (Site Acceptance Test) — odbiór u klienta po instalacji

8 sekcji:

- **A. Typ odbioru** — toggle FAT/SAT + klient + lokalizacja + dokument referencyjny
- **B. Uczestnicy** — dwie osobne listy (strona klienta + strona wykonawcy)
  każda z imieniem i funkcją. Na mobile imię + funkcja stackowane (dwa rzędy),
  na desktop w jednym wierszu
- **C. Testy odbiorowe** — lista ad-hoc, każdy test:
  - opis (textarea z dyktowaniem),
  - kryterium akceptacji (text),
  - wynik 4-state (`✓ Zaliczony` / `✗ Niezaliczony` / `~ Warunkowo` / `— N/A`)
    z dużymi kolorowymi przyciskami do szybkiego klikania w słońcu,
  - uwagi z dyktowaniem,
  - media (zdjęcia HMI, pomiary, wideo).
  
  Domyślny status nowego testu = `Pass` (większość testów się udaje — mniej
  kliknięć). Statystyka pass/cond/fail na bieżąco w nagłówku sekcji.
  **Drag-to-reorder**.
- **D. Lista usterek (punchlist)** — niezależna lista uwag z priorytetem
  (🔴 Krytyczne / 🟡 Istotne / 🟢 Drobne). **Drag-to-reorder**.
- **E. Status końcowy** — `✓ Zaakceptowano` / `~ Warunkowo` / `✗ Odrzucono`
- **F. Wnioski i komentarze ogólne**
- **G. Podpisy stron** — pola imię + data dla klienta i wykonawcy.
  W PDF rendowane jako dwa boxy obok siebie z linią do ręcznego podpisania długopisem.
- **H. Dokumentacja fotograficzna ogólna**

Plik PDF ma dynamiczny tytuł: "RAPORT ODBIORU FABRYCZNEGO (FAT)" lub
"RAPORT ODBIORU NA OBIEKCIE (SAT)" + kolorowy badge statusu końcowego.
Nazwa pliku ZIP: `{nr}_FAT_2026-05-20.zip` lub `{nr}_SAT_2026-05-20.zip`.

### Multimedia

- **Zdjęcia z aparatu** — natywne wywołanie aparatu telefonu (Chrome odpala
  natychmiast, iOS pokazuje menu wyboru, na desktopie eksplorator plików)
- **Wideo z aparatu** — analogicznie, zapisywane jako oryginalny plik
- **Wybór z galerii** — multi-select foto + wideo
- **Adnotacje na zdjęciach** — fullscreen edytor canvas (PhotoAnnotator)
  z narzędziami: strzałka, kółko, prostokąt, rysowanie odręczne, tekst.
  6 kolorów, 3 grubości linii (6/12/22 CSS px), undo, wyczyść. Pracuje
  na pełnej rozdzielczości oryginału, po zapisie regeneruje miniaturkę
  z naniesionymi adnotacjami.
- **Edycja adnotacji po fakcie** (od v0.4) — tap kształt = zaznacz
  (przerywany niebieski bbox + białe uchwyty na rogach/końcach):
  - **drag całości** = przesunięcie
  - **drag uchwytu** = zmiana rozmiaru
  - **klik koloru/grubości** = restyling zaznaczonego
  - **✎ Edytuj tekst** dla zaznaczonego tekstu
  - **🗑 Usuń zaznaczony** — pojedynczy item bez `Cofnij` ostatnich N
- **Skalowanie do CSS pikseli** (od v0.3) — grubości linii liczone w pikselach
  ekranu, niezależnie od rozdzielczości zdjęcia. Linia 6px wygląda tak samo
  na telefonie i komputerze.
- **Voice-to-text** — przycisk 🎤 w każdym textarea komentarzy/uwag/wniosków.
  Web Speech API, język `pl-PL`, dyktujesz, tekst dopisuje się do pola.

### Wynikowa paczka raportu

Po kliknięciu `📦 Pobierz paczkę` apka generuje:

```
RPT-2026-018_2026-05-18.zip
├── RPT-2026-018_2026-05-18.pdf  (profesjonalny PDF, A4, z miniaturami)
├── zdjecia/
│   ├── 01_Zatrzymanie-1_Zaciecie-detalu.jpg
│   ├── 02_Zatrzymanie-3_Awaria-mechaniczna__widok-z-boku.jpg
│   └── ...                       (oryginały w pełnej rozdzielczości)
└── wideo/
    └── 01_Zatrzymanie-2_Regulacja__nagranie-osi.mp4
```

**Nazwy plików kodują lokalizację w raporcie** — klient czyta PDF, zna
nazwę pliku, otwiera go w folderze ZIP. Bez zgadywania.

### Walidacja przed pobraniem (od v0.8)

Klikasz `📦 Pobierz paczkę` przy niekompletnym raporcie → confirm modal
z listą braków:

> **Niekompletny raport**
> Brakuje następujących pól:
> • Numer raportu
> • Klient / Zamawiający
> • Co najmniej 1 test (sekcja C)
>
> [Uzupełnij] [Pobierz mimo to]

- **Uzupełnij** → smooth scroll do pierwszej brakującej sekcji
- **Pobierz mimo to** → kontynuuje bez blokady (nie zmuszamy)

Wymagania per typ (`src/utils/validateReport.js`):

| Typ | Wspólne | Type-specific |
|---|---|---|
| **Wszystkie** | nr raportu, projekt, maszyna, data, autor | — |
| Commissioning | + | sesja rozpoczęta |
| Service | + | klient, lokalizacja, ≥1 czynność |
| Prototype | + | podzespół, cel testu, ≥1 punkt |
| SAT/FAT | + | klient, lokalizacja, ≥1 test |

### Lista raportów i ich zarządzanie

Ekran startowy zawiera:

- Listę wszystkich raportów sortowaną wg ostatniej modyfikacji
- **Wyszukiwarkę pełnotekstową** z normalizacją polskich diakrytyków
  („lodz" znajduje „Łódź"). Indeksuje opis testów, uwagi, punchlist,
  uczestników (dla SAT/FAT) — nie tylko nagłówek.
- **Filtry chipowe** — typ raportu (multi-select, 4 typy łącznie z 📋 SAT/FAT),
  status (Roboczy / Ukończony)
- **Podświetlenie ostatnio edytowanego** raportu (niebieski ring + chip)
- **Akcje per raport:** Otwórz / **📋 Duplikuj** / 📦 Pobierz / Usuń

### Klonowanie raportu

`📋 Duplikuj` tworzy „inteligentną kopię":

| Typ | Co zostaje (template) | Co znika (transakcyjne) |
|---|---|---|
| Serwis | Klient, lokalizacja, projekt, maszyna, autor | Czynności, części, opisy, zdjęcia, status, godziny |
| Prototyp | Podzespół, metoda, setup, parametry; **iteracja +1** | Punkty kontrolne, ocena, decyzja, zdjęcia |
| Uruchomienie | Projekt, maszyna, autor | Wszystko inne (timer, stops, opisy, zdjęcia) |
| SAT/FAT | Typ FAT/SAT, klient, lokalizacja, dokument, uczestnicy | Testy, punchlist, podpisy, status końcowy, zdjęcia |

### Drag-to-reorder (od v0.8)

5 list w aplikacji ma chwyt `≡` z lewej strony pozycji:
- Testy + Punchlist (SAT/FAT)
- Czynności + Części (Serwis)
- Punkty kontrolne (Prototyp)

Mobile: **przytrzymaj 200ms** żeby zacząć drag (delay nie koliduje ze scrollowaniem).
Desktop: chwyć i ciągnij od razu (5px tolerance).

Implementacja: `@dnd-kit/sortable` (~15kb gzipped) + reusable
`<SortableList>` z render-prop API. Każda lista to ~5 dodanych linii.

### Auto-save

Każda zmiana w raporcie jest zapisywana automatycznie z debouncing 300ms.
Indicator `💾 Zapisano o 14:32` u góry ekranu raportu pokazuje czas
ostatniego zapisu. Na unmount komponentu wykonuje się final flush —
żadna zmiana nie ginie nawet jeśli user nawiguje w trakcie pisania.

### Loading overlay podczas PDF (od v0.8)

Przy `📦 Pobierz paczkę` pojawia się pełnoekranowy overlay:
- Spinner CSS (ring `border-t-sure-blue` + `animate-spin`)
- Rotujące hasła co 1.5s: „Przygotowanie danych..." → „Generowanie PDF..."
  → „Pakowanie multimediów..." → „Finalizacja paczki..."
- Animowane skeleton-bary pod spodem dla efektu „buduje się"

Backbox pozostawia button w stanie disabled. Lepsze niż samo `⏳ Generowanie...`
bo daje sygnał że to wieloetapowy proces.

### Tryb jasny / ciemny (od v0.5)

- Toggle ☀️/🌙 w prawym górnym rogu obok badge wersji
- **Pierwsza wizyta** respektuje `prefers-color-scheme` systemu
- **Persystencja** w localStorage (`suresolutions.theme`)
- **Brak FOUC** — inline `<script>` w `index.html` aplikuje `.dark` na `<html>`
  PRZED hydratacją React, więc dark-mode user nie widzi białego błysku
- **PWA theme-color meta** zmienia się dynamicznie (sure-blue w light,
  granat w dark) — wpływa na status bar iOS i pasek narzędzi Androida

### Onboarding tour (od v0.8)

Przy pierwszym uruchomieniu (klucz `suresolutions.onboarding.v2.dismissed`)
pokazuje się 5-kartowy tour:
1. 👋 Witaj
2. 📋 4 typy raportów
3. 📷 Foto + adnotacje
4. 🎤 Dyktowanie głosem
5. 🌗 Tryb ciemny + instalacja PWA

Swipe lewo/prawo (touch delta > 50px) zmienia kartę. Dots indicator na dole,
przyciski Wstecz/Dalej, "Pomiń" zawsze widoczny. Po zamknięciu tour'a
nie pokazuje się ponownie.

### PWA — instalacja na telefonie

- **Android Chrome:** baner „Zainstaluj aplikację" lub menu ⋮ →
  „Dodaj do ekranu głównego"
- **iOS Safari:** przycisk udostępnienia → „Dodaj do ekranu początkowego"
- **Desktop:** ikona instalacji w pasku adresu

Po instalacji apka działa standalone (bez paska URL), pełnoekranowo,
z ikoną „Raporty SURE" na pulpicie.

### Aktualizacje aplikacji (od v0.9)

- **Auto-sprawdzenie przy każdym wejściu** (visibility change + window focus)
- **Periodyczne sprawdzanie co 30 min** gdy apka jest otwarta
- **Klikalny przycisk `v0.9 🔄`** w prawym górnym rogu — ręczne sprawdzenie
  z toastem feedbacku
- **Tryb `prompt`** (od v0.9) — nowy SW czeka w "waiting" state, banner
  `UpdatePrompt` pokazuje „Nowa wersja → Odśwież", klik wykonuje skipWaiting
  + reload page → user widzi nowy numer
- **Wcześniej** był `autoUpdate` (do v0.8 włącznie) — SW updateował się
  automatycznie w tle, ale strona z JS-em w pamięci nie wiedziała o nowej
  wersji. Fix w v0.9.

### Pełna lista funkcjonalności

- 4 typy raportów z dedykowanymi workflow
- Foto + wideo z aparatu/galerii
- Adnotacje na zdjęciach z edycją po fakcie (PhotoAnnotator z move/resize/restyle)
- Voice-to-text (Web Speech API, pl-PL)
- Auto-save z debounce + save-on-unmount
- Walidacja przed pobraniem PDF
- Drag-to-reorder dla 5 list
- Loading overlay podczas PDF generation
- Onboarding tour 5-card swipeable
- Tryb jasny / ciemny z persystencją + system pref
- Sticky bottom action bar
- Sticky pasek nawigacji sekcji (A/B/C) z IntersectionObserver
- Toast + custom confirm dialog (zastąpiły alert/confirm)
- Empty states w listach dynamicznych
- Skeleton loaders dla miniatur
- Pełnotekstowa wyszukiwarka z PL-aware normalizacją
- Filtry chipowe na liście raportów
- Klonowanie raportów
- Eksport jako paczka ZIP z kontekstowymi nazwami plików
- Zdjęcia w PDF (skompresowane miniatury) + w ZIP (oryginały)
- Wideo w ZIP
- Inteligentne łamanie stron w PDF (z respektem dla podpisów + foto + tabel)
- PWA installable + offline
- Mechanizm aktualizacji (auto + manual, prompt mode od v0.9)

---

## Architektura i stack techniczny

### Stack główny

| Warstwa | Technologia | Wersja | Po co |
|---|---|---|---|
| Framework UI | **React** | 18.3 | Komponenty, hooks, declarative state |
| Build tool | **Vite** | 5.4 | Szybki dev server, ESM, code-splitting |
| CSS | **Tailwind CSS** | 3.4 | Utility-first, mały bundle dzięki purge, dark-mode `class` strategy |
| Drag & drop | **@dnd-kit** | 6.3 | Sortable listy z touch/mouse/keyboard support |
| PDF generation | **jsPDF** + **html2canvas** | 2.5 + 1.4 | Renderowanie HTML → canvas → PDF |
| Pakowanie | **JSZip** | 3.10 | Tworzenie ZIP-a z PDF + media |
| PWA | **vite-plugin-pwa** | 1.3 | Service Worker (`prompt` mode), manifest, Workbox |
| Hosting | **GitHub Pages** | — | Statyczny, darmowy, HTTPS |
| CI/CD | **GitHub Actions** | — | Auto-deploy na push |
| Image proc (build) | **sharp** | 0.34 | Generowanie ikon PWA + placeholderów |
| Marketing capture | **Playwright** | latest | Headless screenshots + screencasty |

### Architekturalne decyzje

**Aplikacja jest w 100% kliencka.** Brak serwera, brak API, brak bazy danych
zewnętrznej, brak logowania. Wszystkie dane żyją w przeglądarce użytkownika.

To była celowa decyzja podyktowana:
- **Prywatnością** — dane raportów (klienci, maszyny, awarie) nie wychodzą
  z urządzenia
- **Brakiem zależności** — żadnych SaaS, subskrypcji, kont, GDPR
- **Prostotą deploymentu** — statyczna apka, GitHub Pages = 0 zł/mc
- **Offline-first** — apka musi działać na hali bez sygnału

Konsekwencje: brak synchronizacji między urządzeniami, brak agregacji danych
dla właściciela, brak współdzielenia raportu między pracownikami zespołu.
Świadomie przyjęte ograniczenia — zob. [Limity i ograniczenia](#limity-i-ograniczenia).

### Wzorce kodu

- **Pure functional React** — komponenty funkcyjne, hooks, brak klas
- **Context dla cross-cutting concerns** — Toast/Confirm, Service Worker
  manager, Theme provider (małe lokalne konteksty zamiast jednego globalnego store)
- **Custom hooks** dla reużywalnej logiki — `useAutoSave`, `useToast`,
  `useConfirm`, `useSW`, `useTheme`
- **Hash-based routing** — bez react-router. Lekkie, działa na GitHub Pages
  bez konfiguracji rewrites
- **Tailwind component classes** — `.btn-*`, `.field-*`, `.card`,
  `.index-badge`, `.action-bar` itd. zdefiniowane raz w `index.css`
  z dark-mode variants, używane wszędzie
- **Render-prop dla reużywalnych wrapperów** — `<SortableList>` z funkcją
  `(item, dragHandle, i) => JSX` jako children

---

## Struktura projektu

```
/src
  /assets
    logo.png                  ← logo SureSolutions
  /components
    /common                   ← reużywalne UI primitives
      AutoSaveIndicator.jsx
      EmptyState.jsx
      Header.jsx              ← wspólny nagłówek raportu (numer/data/etc.)
      InstallPrompt.jsx       ← banner "Zainstaluj apkę"
      LoadingOverlay.jsx      ← (v0.8) fullscreen modal podczas PDF gen
      MediaUploader.jsx       ← foto+wideo+galeria, IDB storage
      OnboardingTour.jsx      ← (v0.8) 5-kartowy tour pierwszej wizyty
      PhotoAnnotator.jsx      ← fullscreen canvas annotator z edycją (move/resize)
      SectionNav.jsx          ← sticky pasek sekcji A/B/C
      SortableList.jsx        ← (v0.8) reusable @dnd-kit wrapper
      SuggestInput.jsx        ← wrapper input (autouzupełnianie obecnie off)
      SWManager.jsx           ← Service Worker context (prompt mode od v0.9)
      ThemeContext.jsx        ← (v0.5) ThemeProvider + useTheme + ThemeToggle
      Toast.jsx               ← ToastProvider + useToast + useConfirm
      ToggleGroup.jsx         ← ujednolicony toggle-buttons group
      UpdatePrompt.jsx        ← banner "Nowa wersja"
      VoiceMic.jsx            ← MicButton + MicTextarea (Web Speech API)
    /reports
      CommissioningReport.jsx ← Typ 3: live timer + log zatrzymań
      ServiceReport.jsx       ← Typ 2: serwis na obiekcie
      PrototypeReport.jsx     ← Typ 1: iteracyjne testy prototypu
      SatFatReport.jsx        ← (v0.6) Typ 4: odbiór maszyny FAT/SAT
  /pages
    Home.jsx                  ← lista raportów + wyszukiwarka + filtry
    NewReport.jsx             ← wybór typu raportu (4 kafelki)
  /utils
    imageCompressor.js        ← Canvas-based JPEG kompresor
    imageStore.js             ← IndexedDB wrapper (images + videos + originals)
    pdfGenerator.js           ← HTML→canvas→PDF + ZIP assembly (4 templates)
    storage.js                ← localStorage CRUD raportów + cloneReport
    suggestions.js            ← (autouzupełnianie wyłączone w UI)
    useAutoSave.js            ← debounced auto-save hook
    validateReport.js         ← (v0.8) walidacja wymaganych pól per typ
  App.jsx                     ← shell + routing + Theme/SW/Toast providers
  main.jsx                    ← entry point
  index.css                   ← Tailwind base + components (z dark: variants)

/public
  logo.png                    ← icon
  /icons
    icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png

/scripts
  generate-icons.mjs          ← generowanie ikon PWA z logo
  /marketing
    generate-placeholders.mjs ← industrial-style placeholder photos
    seed-data.mjs             ← demo raporty dla marketing capture
    capture.mjs               ← Playwright: screenshots + video recording
    convert-videos.mjs        ← ffmpeg webm → mp4

/marketing                    ← gotowe materiały do LinkedIn
  /desktop, /mobile, /videos
  README.md

/.github/workflows/deploy.yml ← Actions: build + deploy do GitHub Pages
vite.config.js                ← Vite config + PWA (prompt mode) + manualChunks
tailwind.config.js            ← darkMode: 'class', kolory sure.{blue,dark}
package.json, postcss.config.js
index.html                    ← inline theme script (no-FOUC)
```

---

## Przechowywanie danych

Trzy warstwy storage, każda przemyślana pod konkretny rodzaj danych:

### 1. localStorage

| Klucz | Co przechowuje |
|---|---|
| `suresolutions.reports.v1` | Tablica raportów (JSON) — id, type, status, header, payload type-specific |
| `suresolutions.theme` | `'light'` lub `'dark'` (od v0.5) |
| `suresolutions.onboarding.v2.dismissed` | `'1'` po pierwszym zamknięciu touru (od v0.8) |
| `suresolutions.onboarding.v1.dismissed` | Stary klucz (do v0.7), już nieużywany |
| `suresolutions.install.dismissed` | `'1'` po odrzuceniu prompt-u instalacji PWA |

Limit ~5-10 MB per origin. Realnie ~500-1000 raportów (sam JSON bez mediów).

**Operacje:** `loadAll`, `getById`, `upsert`, `remove`, `saveAll`, `newId`,
`cloneReport`, `collectMediaIds`.

### 2. IndexedDB (baza: `suresolutions.images.v1`, wersja: 3)

Trzy object stores:

- **`images`** — skompresowane miniatury (`400×300px JPEG q0.7`, ~30-50 KB
  każda) jako dataURL stringi. Używane w UI + embedowane w PDF.
- **`originals`** — pełnowymiarowe oryginały zdjęć jako Blob (z aparatu mogą
  mieć 2-10 MB). Pakowane do folderu `zdjecia/` w ZIP.
- **`videos`** — pełnowymiarowe wideo jako Blob (50-500 MB każde).
  Pakowane do folderu `wideo/` w ZIP.

Limit: praktycznie **setki MB do GB** zależnie od urządzenia.
Android Chrome: ~6% wolnego miejsca, iOS Safari: ~1 GB.

**Operacje:** `putImage/getImages/deleteImages/replaceImage`,
`putOriginal/getOriginals/deleteOriginals/replaceOriginal`,
`putVideo/getVideos/deleteVideos`. Wszystkie batched przez transakcje.

### 3. Service Worker cache (Workbox)

- **Precache** ~1.3 MB shell apki (HTML, CSS, JS, ikony, manifest)
- **Runtime cache** dla lazy-loaded chunków (jspdf, html2canvas, jszip)
- **Strategie:** cache-first dla static assets, navigateFallback dla SPA routing

Pierwsza wizyta z internetem → wszystko ląduje w cache → kolejne wizyty
działają offline.

### Bezpieczeństwo i prywatność

- **Dane NIGDY nie opuszczają urządzenia** poza dwoma wyjątkami:
  1. Voice-to-text wysyła **audio** do serwera przeglądarki (Google/Apple/MS)
     dla transkrypcji. Tekst wraca i zostaje lokalnie. Świadoma decyzja.
  2. Świadome pobranie paczki ZIP przez użytkownika i wysłanie jej dalej.
- **Brak telemetrii**, **brak analytics**, **brak cookies tracking**.
- **Czyszczenie danych przeglądarki** = utrata wszystkich raportów.
- **iOS Safari** kasuje IDB po ~7 dniach nieużywania, **chyba że** PWA jest
  dodana do ekranu początkowego (wtedy traktuje jak instalację).

---

## Generowanie paczki raportu

Proces od kliknięcia `📦 Pobierz paczkę` do download:

1. **Walidacja** (od v0.8) — `validateReport(report)` sprawdza wymagane
   pola per typ. Jeśli brakuje → confirm modal "Pobrać mimo to?". Cancel
   → smooth scroll do `sec-*` pierwszego braku.
2. **Loading overlay** (od v0.8) — fullscreen modal z rotującymi etapami
   pokazuje się przez cały proces.
3. **Resolve photos** — `resolveReportPhotos(report)` deep-clone raportu
   z dołączonymi dataURL-ami z IDB.
4. **Collect all media** — `collectAllMedia(report)` zwraca uporządkowaną
   listę zdjęć i wideo z kontekstem (np. „Zatrzymanie #3 — Awaria mechaniczna"
   albo „Test #2 — Komunikacja Modbus (✓ Zaliczony)").
5. **Compute filenames** — każde media dostaje `_zipFilename` w formacie
   `NN_kontekst-slug__opis-slug.ext`.
6. **Build HTML** — `buildXxxHtml(report, photos, videos)` generuje pełen
   HTML raportu (~794px szerokości, A4 portrait). Cztery templates:
   commissioning, service, prototype, satfat.
7. **Render to canvas** — html2canvas (lazy-loaded) renderuje DOM na canvas
   przy scale=2 (retina-quality).
8. **Slice into pages** — algorytm inteligentnego łamania stron:
   - Mierzy bounding rects elementów no-break (zdjęcia, wiersze tabeli,
     karty info, signature boxy, h2) PRZED html2canvas
   - Slicuje canvas na strony A4 z marginesem 14mm na górze stron 2+
     i 8mm bufora od dołu
   - Cofa pageEnd jeśli wypadnie w środku no-break elementu
9. **Output PDF** — jsPDF dodaje slice'y jako JPEG z quality 0.92,
   wynikowy PDF jako Blob.
10. **Assemble ZIP** — JSZip pakuje PDF + folder `zdjecia/` (oryginały Blob
    z IDB z proper extension z MIME) + folder `wideo/` (Blob z IDB).
11. **Trigger download** — `URL.createObjectURL` + invisible `<a download>` + click.

Cały proces: ~2-5 sekund dla raportu z 20 zdjęciami i 1 wideo.

### Sygnatury PDF dla SAT/FAT

Sekcja G renderuje dwa `.sig-box` obok siebie z `1px solid #D1D5DB` border,
liczbą `min-height: 110px`, etykietą i `border-top` jako linią do podpisania
długopisem. CSS:

```css
.signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.sig-box { border: 1px solid #D1D5DB; padding: 16px 18px 14px; min-height: 110px; }
.sig-lbl { font-size: 10px; text-transform: uppercase; color: #6B7280; }
.sig-line { border-top: 1px solid #9CA3AF; }
.sig-name { font-size: 12px; font-weight: 600; }
.sig-date { font-size: 10px; color: #6B7280; }
```

Sig-box jest w `NO_BREAK_SELECTORS` więc algorytm łamania stron nigdy
nie pocina go w połowie.

---

## PWA, offline i aktualizacje

### Manifest

```json
{
  "name": "Raporty SURE",
  "short_name": "Raporty SURE",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F3F4F6",
  "theme_color": "#3D70B2",
  "lang": "pl",
  "icons": [192, 512, 512-maskable, 180 apple-touch]
}
```

`theme_color` zmienia się dynamicznie z poziomu JS (ThemeContext) na `#0F172A`
w dark mode — wpływa na status bar iOS i Android chrome.

### Service Worker (Workbox)

- Generated SW przez `vite-plugin-pwa` z **`registerType: 'prompt'`** (od v0.9)
- Precache: HTML/CSS/JS/PNG/SVG/ICO/webmanifest (~23 entries, ~1.3 MB)
- `navigateFallback: index.html` — wszystkie ścieżki SPA działają offline
- `cleanupOutdatedCaches: true` — stare wersje sprzątane przy aktualizacji

### Mechanizm aktualizacji (SWManager + UpdatePrompt)

`SWProvider` w `App.jsx` trzyma `ServiceWorkerRegistration` w ref, eksponuje
context z `needRefresh`, `offlineReady`, `updateNow()`, `checkForUpdate()`.

**Triggery sprawdzania:**
- Visibility change (gdy apka wraca z tła)
- Window focus
- Co 30 min w tle
- **Manualnie** przez tap na klikalny badge `v0.9 🔄` w nagłówku

**Flow w `prompt` mode (od v0.9):**
1. Nowy SW wykryty → instaluje się w "waiting" state
2. `needRefresh = true` → `<UpdatePrompt>` renderuje niebieski banner
   "Nowa wersja aplikacji"
3. User klika **Odśwież** → `updateServiceWorker(true)` →
   `SKIP_WAITING` postMessage do waiting SW → `controllerchange` event
   → `window.location.reload()`
4. User widzi nowy numer wersji

**Wcześniej (do v0.8 włącznie)** był tryb `autoUpdate` który automatycznie
skipWaiting'ował nowy SW, ale strona z JS-em w pamięci nie wiedziała o nowej
wersji. Banner się nie pokazywał, `checkForUpdate()` zawsze widziało
`r.waiting === null` (bo SW już przeszedł w stan active). To skutkowało
zwodniczym toastem "Apka jest aktualna" mimo że SW miał świeży bundle.

### Theme persistence inline script

`index.html` zawiera mały skrypt który aplikuje `.dark` klasę na `<html>`
PRZED hydratacją React:

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('suresolutions.theme');
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (t === 'dark' || (!t && prefersDark)) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
</script>
```

Bez tego dark-mode user widziałby biały błysk (FOUC) przed mountem React-a.

---

## Hosting i CI/CD

### GitHub Pages

Apka hostowana jako static site na `https://lukaszcecelon-bit.github.io/suresolutions-report-app/`.

Vite jest skonfigurowane z `base: './'` — relative paths działają zarówno
przy `npm run preview` (root) jak i na project pages (`/repo/`).

### GitHub Actions (`.github/workflows/deploy.yml`)

Workflow uruchamia się na **każdy push do `main`**:

1. `actions/checkout@v4` — pobiera kod
2. `actions/setup-node@v4` (Node 20 + cache npm)
3. `npm ci` — instalacja zależności
4. `npm run build` — Vite produkcyjny build
5. `actions/upload-pages-artifact@v3` z `dist/`
6. `actions/deploy-pages@v4` — deploy

Całość zajmuje ~35-50 sekund. Pages skonfigurowane z Source = GitHub Actions
(workflow build type), HTTPS wymuszone.

**Update flow:** push do `main` → ~45s budowanie + deploy → user otwiera
apkę → SW detect nowej wersji → banner „Nowa wersja → Odśwież" (od v0.9).

### Zasada wersjonowania (regulamin)

Każda zmiana w kodzie zmienia numer w dwóch miejscach:
- `src/App.jsx` (`VersionBadge` ~linia 51, hardcoded `<span>v0.X</span>`)
- `package.json` (`"version": "0.X.0"`)

Plus wpis do `Historia wersji` w tym dokumencie.

Schemat: patch `v0.X.Y → v0.X.Y+1` dla fixów, minor `v0.X → v0.X+1` dla
nowych funkcji. W UI wystarczy format `v0.X`.

---

## UX, motyw i dostępność

### Tryb jasny / ciemny (od v0.5)

- **Strategia Tailwind:** `darkMode: 'class'` w `tailwind.config.js`
- **ThemeContext** trzyma stan, `useTheme()` hook, `<ThemeToggle />` button
- **Utility classes w `index.css`** mają `dark:` variants — większość UI
  adaptuje się automatycznie (`.card`, `.field-input`, `.field-textarea`,
  `.section-title`, `.action-bar`, `.btn-secondary`, `.skeleton`)
- **Inline override w 20 plikach** — komponenty + raporty + strony mają
  wprost wpisane `dark:bg-gray-700` itd. tam gdzie nie używają utility class
- **`theme-color` meta** zmienia się dynamicznie (sure-blue → granat)
- **Persystencja** w `localStorage.suresolutions.theme`

### Mobile-first

- Wszystkie główne przyciski **min 44×44 px** (Apple HIG / Material guidelines)
- `.btn-icon` ujednolicony do 44×44 (od v0.7) żeby idealnie centrował się
  z `.field-input` (44px) w wierszach `flex items-center`
- `.field-input` ma sztywne **`height: 44px`** (nie `min-height`) + `appearance: none`
  — wymusza identyczną wysokość dla `<input type="date|time">` i `<select>`
  na iOS Safari (od v0.7)
- Custom chevron SVG dla `<select>` jako background-image (od v0.7) bo
  `appearance: none` ukrywa natywną strzałkę
- Wartości `min-w-0` na grid cells żeby native iOS date/time inputs nie
  rozpychały kolumn
- Data + Autor stackowane pionowo na ekranach <640px (sm breakpoint)
- ParticipantsList w SAT/FAT stack imię+funkcja na mobile (od v0.7) bo
  dwa wąskie inputy w jednym wierszu (134px każdy) były ściśnięte

### Wzorce UX

- **Sticky bottom action bar** z hierarchią: główny przycisk większy
  (flex-[2]), drugorzędne mniejsze
- **Sticky pasek sekcji** (A/B/C/...) z IntersectionObserver do podświetlenia
  aktywnej
- **Auto-save indicator** — flash 1.5s + settled state „Zapisano o 14:32"
- **Loader przy generowaniu** (od v0.8) — fullscreen LoadingOverlay z rotującymi
  hasłami, spinnerem CSS i animowanymi skeleton-barami
- **Walidacja przed PDF** (od v0.8) — confirm modal z listą braków,
  scroll-to-section na Anuluj, "Pobierz mimo to" na zatwierdzenie
- **Toast system** — slide-in z prawej, tap-to-dismiss, short duration
  (1.8s success, 3.5s error)
- **Custom confirm dialog** — modal z tytułem + variant (primary/danger)
  zamiast `window.confirm`
- **Empty states** — informacyjne karty „brak danych" z hintem co zrobić
  + wskazówka o drag-to-reorder dla list które na to pozwalają
- **Skeleton loaders** — pulsujący gradient zamiast pustki podczas IDB load
- **Onboarding tour** (od v0.8) — 5-kartowy fullscreen modal z swipe support

### Walidacja

- Pola wymagane: `*` przy labelu (CSS `.field-required::after`)
- Po nieudanej próbie startu (np. Faza 1 w raporcie uruchomienia bez
  wypełnionego nagłówka): czerwone obramowanie (`.is-invalid`) + toast
  „Uzupełnij pola oznaczone *"
- **Przed pobraniem PDF** (od v0.8): comprehensive validation per typ raportu
  z modal "Niekompletny raport — Pobrać mimo to?"

### Focus / klawiatura

- Wszystkie warianty `.btn-*` mają focus ring (sure-blue / red / emerald)
- Tab-navigation działa
- Pola tekstowe mają focus ring `ring-2 ring-sure-blue/30`
- Dark mode focus ring offset adapted (`dark:focus:ring-offset-gray-900`)

### Spójność wizualna

- **Paleta:**
  - `#3D70B2` (sure-blue) jako primary
  - `#1F2937` (sure-dark) jako tekst w light mode
  - `#E5E7EB` jako tekst w dark mode
  - `#0F172A` jako app bg w dark mode
  - `#1F2937` jako surface (cards) w dark mode
  - emerald/amber/red dla statusów
- **Border radius:** `rounded-lg` (8px) dla buttonów/inputów, `rounded-xl`
  (12px) dla kart, `rounded-2xl` (16px) dla overlay modali
- **Typografia:** ui-sans-serif system fonts (przyspieszone, natywne look)
- **Tailwind component classes** centralne — zmiana raz dotyka wszystkich

---

## Optymalizacje wydajności

### Bundle splitting

`vite.config.js` ma `manualChunks`:
- `vendor-react` (~141 KB) — React + ReactDOM, stabilny hash, perfect cache
- Auto-split przez Vite dla dynamicznych importów:
  - `jspdf` (~358 KB) lazy
  - `html2canvas` (~201 KB) lazy
  - `jszip` (~97 KB) lazy
- Main `index-*.js` ~196 KB (zawiera @dnd-kit od v0.8)
- CSS bundle ~47 KB (gzip 7 KB)

### Lazy-load PDF/ZIP libs

`pdfGenerator.js` używa `dynamic import()` wewnątrz `renderHtmlToBlob`
(jspdf + html2canvas) i `assemblePackage` (jszip). Po `await import()`
moduł jest w cache przeglądarki — kolejne wywołania są instant.

### Idle preload

`App.jsx` używa `requestIdleCallback(preload)` po pierwszym paint
— w tle pobiera pdfGenerator + warmupLibs() żeby pierwszy klik
„Pobierz paczkę" nie płacił sieciowo.

### Debounced auto-save

`useAutoSave` hook opakowuje `upsert(report)` w 300ms debounce + flush
on unmount. `JSON.stringify` + `localStorage.setItem` fire ~3×/sek
zamiast ~20×/sek podczas szybkiego pisania.

### Smart photo storage

- Originals (Blob) w IDB → ZIP (full resolution)
- Thumbnails (dataURL 400×300 JPEG) w IDB → PDF + UI
- Adnotacja: edytor pracuje na oryginale, po zapisie regeneruje thumb

### PDF rendering

- Mierzenie no-break ranges PRZED html2canvas (uniknięcie subtelnych
  differencji layoutu)
- Multi-page slicing tylko gdy konieczne (`imgH > pageH`)
- JPEG quality 0.92 (kompromis jakość/rozmiar)

---

## Limity i ograniczenia

### Twarde ściany obecnej architektury

- **Dane tylko per-urządzenie, per-przeglądarka.** Raport zrobiony na
  telefonie nie pojawi się na laptopie. Inny zespół = inne urządzenia
  = brak współdzielenia.
- **Brak synchronizacji** między urządzeniami tego samego użytkownika.
  Workaround: backup do pliku (planowane).
- **Brak dashboardu dla właściciela** agregującego dane z wszystkich
  pracowników (każdy ma swoje urządzenie).
- **Brak współdzielonej bazy klientów** dla całego zespołu.
- **Brak audytu** — kto i kiedy edytował raport (nie ma logowania).
- **Brak push notifications** (np. „follow-up za 7 dni") — wymaga
  serwera dla VAPID.

### Limity technologiczne

- **localStorage 5-10 MB** — limit per origin (raporty są lekkie,
  realnie ~500-1000 sztuk)
- **IndexedDB:** Android Chrome ~6% wolnego dysku, iOS Safari ~1 GB
  → ~setki MB zdjęć i wideo
- **iOS Safari kasuje IDB po ~7 dniach nieużywania**, chyba że PWA
  jest dodana do ekranu początkowego (wtedy traktuje jak instalację)
- **Czyszczenie danych przeglądarki przez użytkownika** = utrata
  wszystkiego (najlepsze zabezpieczenie: pobierz paczkę → wklej do
  OneNote → bezpieczne archiwum)
- **Voice-to-text wysyła audio** do serwera przeglądarki (Google/Apple/MS)
- **Firefox nie wspiera Web Speech API** — mikrofon nie pokazuje się
  (graceful fallback)
- **PWA install na iOS wymaga Safari** (nie Chrome)

### Świadomie pominięte funkcjonalności

(Z oryginalnej specyfikacji i pierwszego backlog'u)

- Backend, baza danych, synchronizacja między urządzeniami
- Logowanie i konta użytkowników
- Integracja z OneNote API (user wkleja PDF ręcznie)
- Wideo embed w PDF (niemożliwe w standardzie PDF/A — wideo idzie jako
  osobny plik w ZIP)
- Wersjonowanie raportów (każdy raport ma jedną „głowę")
- Powiadomienia push

---

## Historia wersji

- **v0.1** — pierwsze działające wydanie (3 typy raportów: commissioning,
  service, prototype; PDF+ZIP; PWA; offline; IndexedDB dla mediów)
- **v0.2** — adnotacje zdjęć (PhotoAnnotator z 5 narzędziami + 6 kolorami),
  optymalizacje wydajności (lazy-load PDF/ZIP, debounced auto-save,
  vendor chunks), SWManager z auto-check aktualizacji
- **v0.3** — fix grubości linii w PhotoAnnotator na mobile (skalowanie do
  CSS px + podbicie bazowych wartości 6/12/22)
- **v0.4** — edycja adnotacji po fakcie: tap kształt = zaznacz, drag =
  przesuń, uchwyty na rogach/końcach = zmień rozmiar, zmiana koloru/grubości
  aplikowana do zaznaczonego, "Edytuj tekst" dla tekstów, "Usuń zaznaczony"
- **v0.5** — tryb jasny/ciemny (ThemeProvider z persystencją w localStorage,
  respekt prefers-color-scheme, toggle ☀️/🌙 w nagłówku, inline skrypt w
  index.html zapobiega FOUC) + rename SS Raporty → **Raporty SURE** (manifest
  PWA, tytuł HTML, nagłówek aplikacji)
- **v0.6** — nowy typ raportu **SAT/FAT** (odbiór maszyny): jeden komponent
  z toggle FAT/SAT, sekcje uczestnicy (klient+wykonawca), testy odbiorowe
  z 4-state statusami (pass/fail/conditional/na), punchlist z priorytetami
  (krytyczne/istotne/drobne), status końcowy (3-state), podpisy stron,
  PDF z signature blocks i statystyką testów
- **v0.7** — wyrównanie pól na mobile: `.field-input` z `height: 44px`
  (zamiast min-height) + `appearance: none` żeby iOS Safari nie robił sobie
  wyższych date/time inputów; `.btn-icon` z 40×40 na 44×44 dla idealnego
  centrowania w `flex items-center`; custom chevron SVG dla `<select>`;
  ParticipantsList w SAT/FAT stacked (imię+funkcja) na mobile
- **v0.8** — cztery ulepszenia UX z backlogu: (1) walidacja przed PDF —
  `validateReport.js` + confirm modal z listą braków, scroll do pierwszej
  brakującej sekcji; (2) drag-to-reorder dla testów/usterek/czynności/części/punktów —
  `@dnd-kit` + reusable `SortableList` z drag handle ≡ (200ms long-press
  na mobile); (3) `LoadingOverlay` podczas generowania PDF z rotującymi
  etapami; (4) `OnboardingTour` z 5 kartami swipeable na pierwszej wizycie
  (klucz v2)
- **v0.9** — fix PWA update flow: `registerType: 'autoUpdate'` → `'prompt'`
  w vite.config.js. Z autoUpdate Workbox automatycznie skipWaiting'ował,
  JS uruchomiony w pamięci pozostawał stary, `needRefresh` nie fire'owało,
  user klikał "Sprawdź aktualizacje" i dostawał toast "Apka jest aktualna"
  mimo że SW w tle miał nową wersję. Tryb 'prompt' trzyma nowy SW w waiting,
  banner UpdatePrompt pokazuje się normalnie, klik "Odśwież" robi
  skipWaiting + reload → user widzi nowy numer.

---

## Potencjalne ulepszenia

### Pozostałe z TOP 5 (z analizy UX)

| # | Co | Status | Estymata |
|---|---|---|---|
| 1 | Walidacja przed PDF | ✅ v0.8 | — |
| 2 | Web Share API ("Wyślij paczkę") | nie zrobione | 0.5 dnia |
| 3 | Drag-to-reorder | ✅ v0.8 | — |
| 4 | Pasek postępu raportu | nie zrobione | 1 dzień |
| 5 | iOS install hint (modal "Dodaj do ekranu głównego") | nie zrobione | 0.5 dnia |

### Drugi rząd (silna wartość)

- **Notatka szybka (Quick capture)** — jeden duży przycisk, foto+tekst+voice
  w 30 sek
- **Eksport historii do XLSX** (substytut dashboardu właściciela) — 0.5d
- **Backup / Import bazy raportów do pliku ZIP** — 1 dzień
- **Galeria zdjęć cross-raport** (siatka wszystkich zdjęć + filtry) — 1d
- **Historia maszyny** (agregat raportów dot. jednej maszyny) — 1d
- **Konfigurowalna stopka firmowa w PDF** (adres, NIP, kontakt) — 0.5d
- **Podpis klienta na ekranie** (canvas + palec, wbity w PDF) — 0.5d
- **Geolokalizacja przy zatrzymaniach** + link Google Maps w PDF — 0.5d
- **Sekcja tabela pomiarów** w raporcie prototypu/uruchomienia — 0.5d
- **Sketch pad** (canvas dla szybkich szkiców palcem) — 0.5d
- **Lock raportu po pobraniu** (ikonka 🔒) — 0.5d
- **Quick-add typowych fraz testów** (chipy w sekcji C SAT/FAT) — 0.5d
- **Voice input dla short fields** (nie tylko textarea) — 0.5d
- **Reaktywować SuggestInput** (autosuggest klient/lokalizacja/autor) — 0.5d
- **Status chips na liście raportów** (pass/cond/fail counters dla SAT/FAT) — 0.5d
- **Color-coded lewy brzeg karty raportu** wg typu — 0.5d
- **Dashboard widget na Home** (wszystkie/robocze/ukończone/w tym tygodniu) — 0.5d

### Trzeci rząd (nice-to-have)

- Notatki audio (nagranie głosowe jako media w paczce ZIP)
- Skanowanie kodów kreskowych/QR (BarcodeDetector API)
- Tryb angielski PDF (toggle przy pobieraniu)
- PIN/blokada apki
- Skróty klawiaturowe na desktopie (Ctrl+N, Esc, Ctrl+S)
- ~~Tryb ciemny~~ ✅ (v0.5)
- Tryb tylko-do-odczytu (pokazanie raportu klientowi)
- Tryb edycji zbiorczej (multi-select usuń/eksport)
- Linkowanie iteracji prototypu (Test #1 ↔ #2 ↔ #3)
- Plan wizyt (lista pre-utworzonych raportów na ten tydzień)
- Pin ulubionych raportów (⭐)
- Tagi/etykiety przekrojowe
- Date range filter na Home
- Sort options (po dacie/nazwie/statusie)
- Audyt kontrastu WCAG AA w dark mode
- Haptic feedback (`navigator.vibrate(10)`)

### Wymaga wyjścia z architektury (backend)

- **Dashboard właściciela** agregujący dane z wszystkich urządzeń zespołu
- **Współdzielona baza klientów** dla całego zespołu
- **Audyt** kto i kiedy edytował
- **Push notifications**
- **AI-redakcja opisów / komentarzy** (Anthropic / OpenAI API, koszt
  ~kilkadziesiąt zł/mc, prywatność: dane idą do USA, wymaga DPA)
  — przeanalizowane, świadomie odroczone na inną wersję

---

## Plan rozwoju

### Faza A — Quality of life (najbliższe tygodnie, klient-only)

Cel: wycisnąć maksimum z obecnej architektury.

**Sprint 1 (zrealizowane w v0.8/0.9):**
- ✅ Walidacja przed PDF
- ✅ Drag-to-reorder
- ✅ Loading overlay
- ✅ Onboarding tour
- ✅ Fix PWA update flow

**Sprint 2 (proponowane):**
- Web Share API (przycisk Wyślij paczkę → systemowy share sheet)
- iOS install hint (modal "Dodaj do ekranu głównego" dla Safari iOS)
- Pasek postępu raportu (0-100% kompletności)
- Eksport historii do XLSX (pierwszy substytut dashboardu właściciela)
- Backup / Import bazy raportów (bezpieczeństwo + ręczny sync)

**Sprint 3:**
- Galeria zdjęć cross-raport + Historia maszyny
- Podpis klienta na ekranie (canvas + palec) + stopka firmowa w PDF
- Settings page (domyślny autor, stopka firmowa, info o aplikacji)

**Wartość:** apka staje się daily driver-em, każdy małym detalem rozwiązuje
codzienny ból. Pozostajemy bez kosztów infrastruktury.

### Faza B — Wyjście z architektury (decyzja strategiczna)

Cel: zaadresować ograniczenia, które fundamentalnie blokują rozwój.
Wymaga zgody na koszty (~30-50 zł/mc) i prywatność (dane w cloud).

**Opcja B.1 — Sync via SharePoint / OneDrive (lekki backend)**
- Apka po zakończeniu raportu wrzuca paczkę ZIP + metadata na firmowy
  SharePoint przez MS Graph API
- Power BI / Excel czyta ze SharePointa, agreguje
- Dashboard właściciela jako osobny artifact
- **Plusy:** używa istniejącej infrastruktury MS 365, dane firmowe nie
  wypływają na zewnątrz
- **Koszt:** prawie 0 (jeśli macie M365), ~2-3 dni implementacji

**Opcja B.2 — Mały backend (Supabase / Cloudflare Workers)**
- Współdzielona baza klientów, maszyn, autoryzacja zespołu
- Real-time dashboard
- Push notifications (follow-up reminders)
- AI-redakcja jako proxy do Anthropic/OpenAI
- **Plusy:** wszystko nowoczesne, skalowalne, „prawdziwa apka"
- **Koszty:** ~30-50 zł/mc, 1-2 tygodnie implementacji
- **Compliance:** GDPR, DPA z Supabase/Anthropic

**Opcja B.3 — Hybrid (zostań kliencki + selective sync)**
- Apka pozostaje klienciem
- Tylko **uploadowi paczki ZIP** dodajemy auto-sync do chmury
- Dane robocze (drafty raportów) zostają lokalne
- Dashboard buduje się z paczek w chmurze
- **Plusy:** najmniejsza zmiana w apce, najbezpieczniej dla danych
- **Koszty:** zależne od storage

### Faza C — AI i zaawansowane funkcje (opcjonalne)

Cel: dorzucić AI tam gdzie ma najwięcej sensu. Wymaga Fazy B.

- AI-redakcja opisów i komentarzy (czysty język do klienta)
- Auto-podsumowanie raportu (tl;dr nad PDF-em)
- Detekcja powtarzających się problemów (cross-raport pattern recognition)
- Voice-to-text z automatycznym formatowaniem akapitów
- Auto-kategoryzacja czynności i części
- OCR na zdjęciach (np. numer seryjny maszyny)

### Faza D — Inna technologia (długofalowo)

Jeśli okaże się, że apka realnie zmienia proces firmowy i warto wyjść
poza PWA → native apka (React Native / Capacitor) + dedykowany backend.

Ale to wejdzie w grę dopiero gdy Faza A i B będą wykorzystywane przez
zespół na codzień przez minimum 6 miesięcy. Premature i niepotrzebne
bez tego ugruntowania.

---

## Metadane projektu

- **Autor:** Łukasz Cecelon, SureSolutions
- **Pierwsza wersja:** maj 2026 (v0.1)
- **Bieżąca wersja:** v0.9 (maj 2026)
- **Licencja:** prywatna (repo publiczne, ale kod = własność SureSolutions)
- **Stack:** React 18, Vite 5, Tailwind 3 (z dark mode), @dnd-kit 6, jsPDF,
  html2canvas, JSZip, vite-plugin-pwa
- **Hosting:** GitHub Pages
- **Repo:** https://github.com/lukaszcecelon-bit/suresolutions-report-app
- **Live:** https://lukaszcecelon-bit.github.io/suresolutions-report-app/

---

*Dokument generowany przy współpracy z Claude (Anthropic). Aktualizowany
dla v0.9 — wszystkie zmiany od v0.2 (4-ty typ raportu SAT/FAT, dark mode,
edycja adnotacji, walidacja, drag-reorder, loading overlay, onboarding tour,
fix PWA update flow, alignment fixes).*
