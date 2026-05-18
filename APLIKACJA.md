# SureSolutions Report App — pełna dokumentacja

Aplikacja webowa (PWA) do tworzenia ustrukturyzowanych raportów technicznych
z testów, serwisów i uruchomień maszyn. Zaprojektowana pod codzienną pracę
konstruktora, serwisanta i właściciela małej firmy inżynierskiej.

**Live:** https://lukaszcecelon-bit.github.io/suresolutions-report-app/
**Repo:** https://github.com/lukaszcecelon-bit/suresolutions-report-app

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
9. [UX i dostępność](#ux-i-dostępność)
10. [Optymalizacje wydajności](#optymalizacje-wydajności)
11. [Limity i ograniczenia](#limity-i-ograniczenia)
12. [Potencjalne ulepszenia](#potencjalne-ulepszenia)
13. [Plan rozwoju](#plan-rozwoju)

---

## Cel i kontekst

Apka rozwiązuje konkretny ból zespołu firmy SureSolutions: **tworzenie raportów
po wizytach u klienta, uruchomieniach maszyn i testach prototypów zajmowało
znacznie więcej czasu niż sama praca techniczna**. Wcześniejszy proces
(notatki odręczne → Word → wklejanie zdjęć → ręczne tworzenie tabelek) jest
żmudny, podatny na pominięcia i odbiega standardem od oczekiwań klienta.

Cele projektu:

- **Skrócić czas raportowania** z ~30 min do ~5 min na parkingu po wizycie
- **Ujednolicić wygląd raportów** wychodzących do klientów
- **Zachować pełną prywatność danych** — żadnych serwerów, żadnego logowania
- **Działać na hali bez sygnału** — offline, na telefonie w rękawicach
- **Zero kosztów utrzymania** — brak subskrypcji, brak hostingu, brak SaaS

Apka jest celowo **wąsko wyspecjalizowana** pod 3 typy dokumentów, ale każdy
typ jest dopracowany pod realny workflow inżyniera.

---

## Główne funkcjonalności

### Trzy typy raportów dopasowane do realnej pracy

#### 1. Raport uruchomienia / obserwacji maszyny (Typ 3 — flagowy)

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

#### 2. Raport serwisu na obiekcie (Typ 2)

Wizyta serwisowa u klienta z 7 sekcjami:

- **A. Dane wizyty** — klient, lokalizacja, godziny przyjazdu/odjazdu
- **B. Wykonane czynności** — dynamiczna lista, każda z kategorią
  (Mechanika/Elektryka/Pneumatyka/Hydraulika/Software/Inne) + opisem + zdjęciami
- **C. Elementy do wymiany** — lista z nazwą, nr katalogowym, priorytetem
  (🔴 Pilne / 🟡 Planowe / 🟢 Obserwacja), komentarzem
- **D. Obserwacje własne** — wolny tekst z voice-to-text
- **E. Rekomendacje** — wolny tekst z voice-to-text
- **F. Status wizyty** — Zakończona / Wymaga follow-up / Oczekuje na części
- **G. Dokumentacja fotograficzna ogólna**

#### 3. Raport testów prototypu / podzespołu (Typ 1)

Iteracyjne testy z punktami kontrolnymi, 6 sekcji:

- **A. Informacje o teście** — testowany podzespół, numer iteracji, metoda
  wytworzenia próbki (Druk 3D / CNC / Inne), cel testu
- **B. Warunki testu** — opis setupu, parametry (klucz → wartość, do 10 par)
- **C. Wyniki testu** — punkty kontrolne z toggle wyniku (✓ OK / ✗ NOK /
  ~ Warunkowo), komentarzem, zdjęciami; ogólna ocena testu
- **D. Obserwacje i wnioski**
- **E. Decyzja** — Wdrożyć / Poprawki → kolejna iteracja / Odrzucić,
  z opisem dalszych kroków
- **F. Dokumentacja fotograficzna ogólna**

### Multimedia

- **Zdjęcia z aparatu** — natywne wywołanie aparatu telefonu (Chrome odpala
  natychmiast, iOS pokazuje menu wyboru, na desktopie eksplorator plików)
- **Wideo z aparatu** — analogicznie, zapisywane jako oryginalny plik
- **Wybór z galerii** — multi-select foto + wideo
- **Adnotacje na zdjęciach** — fullscreen edytor canvas (PhotoAnnotator)
  z narzędziami: strzałka, kółko, prostokąt, rysowanie odręczne, tekst.
  6 kolorów, 3 grubości, undo, wyczyść. Pracuje na pełnej rozdzielczości
  oryginału, po zapisie regeneruje miniaturkę z naniesionymi adnotacjami.
- **Voice-to-text** — przycisk 🎤 w każdym textarea komentarzy w raporcie
  serwisu i uruchomienia. Web Speech API, język `pl-PL`, dyktujesz, tekst
  dopisuje się do pola.

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

### Lista raportów i ich zarządzanie

Ekran startowy zawiera:

- Listę wszystkich raportów sortowaną wg ostatniej modyfikacji
- **Wyszukiwarkę pełnotekstową** z normalizacją polskich diakrytyków
  („lodz" znajduje „Łódź")
- **Filtry chipowe** — typ raportu (multi-select), status (Roboczy / Ukończony)
- **Podświetlenie ostatnio edytowanego** raportu (niebieski ring + chip)
- **Akcje per raport:** Otwórz / **📋 Duplikuj** / 📦 Pobierz / Usuń
- **Onboarding card** dla pierwszego użytkownika

### Klonowanie raportu

`📋 Duplikuj` tworzy „inteligentną kopię":

| Typ | Co zostaje (template) | Co znika (transakcyjne) |
|---|---|---|
| Serwis | Klient, lokalizacja, projekt, maszyna, autor | Czynności, części, opisy, zdjęcia, status, godziny |
| Prototyp | Podzespół, metoda, setup, parametry; **iteracja +1** | Punkty kontrolne, ocena, decyzja, zdjęcia |
| Uruchomienie | Projekt, maszyna, autor | Wszystko inne (timer, stops, opisy, zdjęcia) |

### Auto-save

Każda zmiana w raporcie jest zapisywana automatycznie z debouncing 300ms.
Indicator `💾 Zapisano o 14:32` u góry ekranu raportu pokazuje czas
ostatniego zapisu. Na unmount komponentu wykonuje się final flush —
żadna zmiana nie ginie nawet jeśli user nawiguje w trakcie pisania.

### PWA — instalacja na telefonie

- **Android Chrome:** baner „Zainstaluj aplikację" lub menu ⋮ →
  „Dodaj do ekranu głównego"
- **iOS Safari:** przycisk udostępnienia → „Dodaj do ekranu początkowego"
- **Desktop:** ikona instalacji w pasku adresu

Po instalacji apka działa standalone (bez paska URL), pełnoekranowo,
z ikoną na pulpicie.

### Aktualizacje aplikacji

- **Auto-sprawdzenie przy każdym wejściu** (visibility change + window focus)
- **Periodyczne sprawdzanie co 30 min** gdy apka jest otwarta
- **Klikalny przycisk `v0.2 🔄`** w prawym górnym rogu — ręczne sprawdzenie
  z toastem feedbacku (`✓ Apka jest aktualna` lub banner z nową wersją)
- **Banner „Nowa wersja → Odśwież"** gdy SW wykryje update

### Pełna lista funkcjonalności

- 3 typy raportów z dedykowanymi workflow
- Foto + wideo z aparatu/galerii
- Adnotacje na zdjęciach (PhotoAnnotator)
- Voice-to-text (Web Speech API, pl-PL)
- Auto-save z debounce + save-on-unmount
- Sticky bottom action bar
- Sticky pasek nawigacji sekcji (A/B/C) z IntersectionObserver
- Toast + custom confirm dialog (zastąpiły alert/confirm)
- Empty states w listach dynamicznych
- Skeleton loaders dla miniatur
- Walidacja wizualna pól wymaganych
- Pełnotekstowa wyszukiwarka z PL-aware normalizacją
- Filtry chipowe na liście raportów
- Klonowanie raportów
- Eksport jako paczka ZIP z kontekstowymi nazwami plików
- Zdjęcia w PDF (skompresowane miniatury) + w ZIP (oryginały)
- Wideo w ZIP
- Inteligentne łamanie stron w PDF
- PWA installable + offline
- Mechanizm aktualizacji (auto + manual)

---

## Architektura i stack techniczny

### Stack główny

| Warstwa | Technologia | Wersja | Po co |
|---|---|---|---|
| Framework UI | **React** | 18.3 | Komponenty, hooks, declarative state |
| Build tool | **Vite** | 5.4 | Szybki dev server, ESM, code-splitting |
| CSS | **Tailwind CSS** | 3.4 | Utility-first, mały bundle dzięki purge |
| PDF generation | **jsPDF** + **html2canvas** | 2.5 + 1.4 | Renderowanie HTML → canvas → PDF |
| Pakowanie | **JSZip** | 3.10 | Tworzenie ZIP-a z PDF + media |
| PWA | **vite-plugin-pwa** | 1.3 | Service Worker, manifest, Workbox |
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
  manager (małe, lokalne konteksty zamiast jednego globalnego store)
- **Custom hooks** dla reużywalnej logiki — `useAutoSave`, `useToast`,
  `useConfirm`, `useSW`
- **Hash-based routing** — bez react-router. Lekkie, działa na GitHub Pages
  bez konfiguracji rewrites
- **Tailwind component classes** — `.btn-*`, `.field-*`, `.card`,
  `.index-badge` itd. zdefiniowane raz w `index.css`, używane wszędzie

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
      MediaUploader.jsx       ← foto+wideo+galeria, IDB storage
      PhotoAnnotator.jsx      ← fullscreen canvas annotator
      SectionNav.jsx          ← sticky pasek sekcji A/B/C
      SuggestInput.jsx        ← wrapper input (autouzupełnianie obecnie off)
      SWManager.jsx           ← Service Worker context (auto + manual update)
      Toast.jsx               ← ToastProvider + useToast + useConfirm
      ToggleGroup.jsx         ← ujednolicony toggle-buttons group
      UpdatePrompt.jsx        ← banner "Nowa wersja"
      VoiceMic.jsx            ← MicButton + MicTextarea (Web Speech API)
    /reports
      CommissioningReport.jsx ← Typ 3: live timer + log zatrzymań
      ServiceReport.jsx       ← Typ 2: serwis na obiekcie
      PrototypeReport.jsx     ← Typ 1: iteracyjne testy prototypu
  /pages
    Home.jsx                  ← lista raportów + wyszukiwarka + filtry
    NewReport.jsx             ← wybór typu raportu
  /utils
    imageCompressor.js        ← Canvas-based JPEG kompresor
    imageStore.js             ← IndexedDB wrapper (images + videos + originals)
    pdfGenerator.js           ← HTML→canvas→PDF + ZIP assembly
    storage.js                ← localStorage CRUD raportów + cloneReport
    suggestions.js            ← (autouzupełnianie wyłączone w UI)
    useAutoSave.js            ← debounced auto-save hook
  App.jsx                     ← shell + routing + ToastProvider + SWProvider
  main.jsx                    ← entry point
  index.css                   ← Tailwind base + components

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
  /desktop                    ← 6 screenshotów 1280×800 @2x
  /mobile                     ← 8 screenshotów iPhone 14
  /videos                     ← 2 wideo MP4 + WebM
  README.md                   ← indeks

/.github/workflows/deploy.yml ← Actions: build + deploy do GitHub Pages
vite.config.js                ← Vite config + PWA + manualChunks
tailwind.config.js, postcss.config.js
package.json
```

---

## Przechowywanie danych

Trzy warstwy storage, każda przemyślana pod konkretny rodzaj danych:

### 1. localStorage (key: `suresolutions.reports.v1`)

Przechowuje **tablicę raportów jako JSON**. Każdy raport ma id, type, status,
header, oraz pola specyficzne dla typu. Multimedia są w raporcie referowane
przez `photoId`, `originalId`, `videoId` — nie inline.

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

- **Precache** ~1.2 MB shell apki (HTML, CSS, JS, ikony, manifest)
- **Runtime cache** dla lazy-loaded chunków (jspdf, html2canvas, jszip)
- **Strategie:** cache-first dla static assets, navigateFallback dla SPA routing

Pierwsza wizyta z internetem → wszystko ląduje w cache → kolejne wizyty
działają offline.

### Bezpieczeństwo prywatność

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

1. **Resolve photos** — `resolveReportPhotos(report)` deep-clone raportu
   z dołączonymi dataURL-ami z IDB
2. **Collect all media** — `collectAllMedia(report)` zwraca uporządkowaną
   listę zdjęć i wideo z kontekstem (np. „Zatrzymanie #3 — Awaria mechaniczna")
3. **Compute filenames** — każde media dostaje `_zipFilename` w formacie
   `NN_kontekst-slug__opis-slug.ext`
4. **Build HTML** — `buildXxxHtml(report, photos, videos)` generuje pełen
   HTML raportu (~793px szerokości, A4 portrait)
5. **Render to canvas** — html2canvas (lazy-loaded) renderuje DOM na canvas
   przy scale=2 (retina-quality)
6. **Slice into pages** — algorytm inteligentnego łamania stron:
   - Mierzy bounding rects elementów no-break (zdjęcia, wiersze tabeli,
     karty info, h2) PRZED html2canvas
   - Slicuje canvas na strony A4 z marginesem 14mm na górze stron 2+
     i 8mm bufora od dołu
   - Cofa pageEnd jeśli wypadnie w środku no-break elementu
7. **Output PDF** — jsPDF dodaje slice'y jako JPEG z quality 0.92,
   wynikowy PDF jako Blob
8. **Assemble ZIP** — JSZip pakuje PDF + folder `zdjecia/` (oryginały Blob
   z IDB z proper extension z MIME) + folder `wideo/` (Blob z IDB)
9. **Trigger download** — `URL.createObjectURL` + invisible `<a download>` + click

Cały proces: ~2-5 sekund dla raportu z 20 zdjęciami i 1 wideo.

---

## PWA, offline i aktualizacje

### Manifest

```json
{
  "name": "SureSolutions Raporty",
  "short_name": "SS Raporty",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#F3F4F6",
  "theme_color": "#3D70B2",
  "lang": "pl",
  "icons": [192, 512, 512-maskable, 180 apple-touch]
}
```

### Service Worker (Workbox)

- Generated SW przez `vite-plugin-pwa` z `registerType: 'autoUpdate'`
- Precache: HTML/CSS/JS/PNG/SVG/ICO/webmanifest (~23 entries, ~1.2 MB)
- `navigateFallback: index.html` — wszystkie ścieżki SPA działają offline
- `cleanupOutdatedCaches: true` — stare wersje sprzątane przy aktualizacji

### Mechanizm aktualizacji (SWManager + UpdatePrompt)

`SWProvider` w `App.jsx` trzyma `ServiceWorkerRegistration` w ref, eksponuje
context z `needRefresh`, `offlineReady`, `updateNow()`, `checkForUpdate()`.

Triggery sprawdzania:
- Visibility change (gdy apka wraca z tła)
- Window focus
- Co 30 min w tle
- **Manualnie** przez tap na klikalny badge `v0.2 🔄` w nagłówku

`<UpdatePrompt>` jest consumer kontekstu — renderuje banner gdy `needRefresh`.

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

Całość zajmuje ~60-90 sekund. Pages skonfigurowane z Source = GitHub Actions
(workflow build type), HTTPS wymuszone.

**Update flow:** push do `main` → ~1.5 min budowanie + deploy → user otwiera
apkę → SW detect nowej wersji → banner „Nowa wersja → Odśwież".

---

## UX i dostępność

### Mobile-first

- Wszystkie główne przyciski **min 44×44 px** (Apple HIG / Material guidelines)
- Touch-friendly hit area dla ikon w listach (`.btn-icon` 40×40, `.btn-icon-sm` 32×32)
- Wartości min-w-0 na grid cells żeby native iOS date/time inputs nie
  rozpychały kolumn
- Data + Autor stackowane pionowo na ekranach <640px (sm breakpoint)

### Wzorce UX

- **Sticky bottom action bar** z hierarchią: główny przycisk większy
  (flex-[2]), drugorzędne mniejsze
- **Sticky pasek sekcji** (A/B/C/...) z IntersectionObserver do podświetlenia
  aktywnej
- **Auto-save indicator** — flash 1.5s + settled state „Zapisano o 14:32"
- **Loader przy generowaniu** — przycisk disabled + tekst „⏳ Generowanie…"
- **Toast system** — slide-in z prawej, tap-to-dismiss, short duration
  (1.8s success, 3.5s error)
- **Custom confirm dialog** — modal z tytułem + variant (primary/danger)
  zamiast `window.confirm`
- **Empty states** — informacyjne karty „brak danych" z hintem co zrobić
- **Skeleton loaders** — pulsujący gradient zamiast pustki podczas IDB load
- **Onboarding card** — pojawia się raz na pierwszej wizycie, dismissed
  do localStorage

### Walidacja

- Pola wymagane: `*` przy labelu (CSS `.field-required::after`)
- Po nieudanej próbie startu (np. Faza 1 w raporcie uruchomienia bez
  wypełnionego nagłówka): czerwone obramowanie (`.is-invalid`) + toast
  „Uzupełnij pola oznaczone *"

### Focus / klawiatura

- Wszystkie warianty `.btn-*` mają focus ring (sure-blue / red / emerald)
- Tab-navigation działa
- Pola tekstowe mają focus ring `ring-2 ring-sure-blue/30`

### Spójność wizualna

- **Paleta:** `#3D70B2` (sure-blue) jako primary, emerald/amber/red dla
  statusów, walnut warmth w PDF
- **Border radius:** `rounded-lg` (8px) dla buttonów/inputów, `rounded-xl`
  (12px) dla kart
- **Typografia:** ui-sans-serif system fonts (przyspieszone, natywne look)
- **Tailwind component classes** centralne — zmiana raz dotyka wszystkich

---

## Optymalizacje wydajności

### Bundle splitting

`vite.config.js` ma `manualChunks`:
- `vendor-react` (141 KB) — React + ReactDOM, stabilny hash, perfect cache
- Auto-split przez Vite dla dynamicznych importów:
  - `jspdf` (358 KB) lazy
  - `html2canvas` (201 KB) lazy
  - `jszip` (97 KB) lazy
- Main `index-*.js` ~106 KB

### Lazy-load PDF/ZIP libs

`pdfGenerator.js` używa `dynamic import()` wewnątrz `renderHtmlToBlob`
(jspdf + html2canvas) i `assemblePackage` (jszip). Po `await import()`
moduł jest w cache przeglądarki — kolejne wywołania są instant.

**Initial paint:** ~250 KB (vs ~900 KB przed) = **3.6× szybszy first load**.

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

(Z oryginalnej specyfikacji)

- Backend, baza danych, synchronizacja między urządzeniami
- Logowanie i konta użytkowników
- Integracja z OneNote API (user wkleja PDF ręcznie)
- Wideo embed w PDF (niemożliwe w standardzie PDF/A — wideo idzie jako
  osobny plik w ZIP)
- Wersjonowanie raportów (każdy raport ma jedną „głowę")
- Powiadomienia push

---

## Potencjalne ulepszenia

### Top 5 do realizacji w obecnej architekturze

| # | Co | Estymata | Wartość |
|---|---|---|---|
| 1 | Notatka szybka (Quick capture) — jeden duży przycisk, foto+tekst+voice w 30 sek | 1 dzień | 🔴 high |
| 2 | Eksport historii do XLSX (substytut dashboardu właściciela) | 0.5 dnia | 🔴 high |
| 3 | Backup / Import bazy raportów do pliku ZIP | 1 dzień | 🔴 high |
| 4 | Galeria zdjęć cross-raport (siatka wszystkich zdjęć + filtry) | 1 dzień | 🟠 med |
| 5 | Historia maszyny (agregat raportów dot. jednej maszyny) | 1 dzień | 🟠 med |

### Drugi rząd (silna wartość)

- **Podpis klienta na ekranie** (canvas + palec, wbity w PDF) — 0.5d
- **Konfigurowalna stopka firmowa w PDF** (adres, NIP, kontakt) — 0.5d
- **Web Share API** — przycisk „Wyślij paczkę" → natywne menu telefonu — 0.5d
- **Geolokalizacja przy zatrzymaniach** + link Google Maps w PDF — 0.5d
- **Sekcja tabela pomiarów** w raporcie prototypu/uruchomienia — 0.5d
- **Sketch pad** (canvas dla szybkich szkiców palcem) — 0.5d
- **Lock raportu po pobraniu** (ikonka 🔒) — 0.5d

### Trzeci rząd (nice-to-have)

- Notatki audio (nagranie głosowe jako media w paczce ZIP)
- Skanowanie kodów kreskowych/QR (BarcodeDetector API)
- Tryb angielski PDF (toggle przy pobieraniu)
- PIN/blokada apki
- Skróty klawiaturowe na desktopie (Ctrl+N, Esc, Ctrl+S)
- Tryb ciemny
- Tryb tylko-do-odczytu (pokazanie raportu klientowi)
- Tryb edycji zbiorczej (multi-select usuń/eksport)
- Linkowanie iteracji prototypu (Test #1 ↔ #2 ↔ #3)
- Plan wizyt (lista pre-utworzonych raportów na ten tydzień)

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

**Sprint 1:**
1. Notatka szybka (Quick capture) — niezależna szybka notatka
2. Eksport historii do XLSX — pierwszy substytut dashboardu właściciela
3. Backup / Import bazy raportów — bezpieczeństwo + ręczny sync

**Sprint 2:**
4. Galeria zdjęć cross-raport + Historia maszyny
5. Podpis klienta + stopka firmowa w PDF + Web Share API

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
- **Pierwsza wersja:** maj 2026
- **Licencja:** prywatna (repo publiczne, ale kod = własność SureSolutions)
- **Stack:** React 18, Vite 5, Tailwind 3, jsPDF, html2canvas, JSZip,
  vite-plugin-pwa
- **Hosting:** GitHub Pages
- **Repo:** https://github.com/lukaszcecelon-bit/suresolutions-report-app
- **Live:** https://lukaszcecelon-bit.github.io/suresolutions-report-app/

---

*Dokument generowany przy współpracy z Claude (Anthropic). Aktualizowany
ręcznie wraz z rozwojem apki.*
