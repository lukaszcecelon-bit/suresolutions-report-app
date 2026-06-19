# Raporty SURE — dokumentacja aplikacji

> Aktualny, kompletny opis aplikacji. Stan na **v0.36**.
> Plik utrzymywany ręcznie — przy większych zmianach aktualizuj odpowiednią sekcję.

**Live:** https://lukaszcecelon-bit.github.io/suresolutions-report-app/
**Repo:** https://github.com/lukaszcecelon-bit/suresolutions-report-app

---

## 1. Czym jest aplikacja

**Raporty SURE** to aplikacja webowa (PWA) dla firmy **SureSolutions** do tworzenia
raportów inżynierskich w terenie i w warsztacie: uruchomień maszyn, serwisów,
testów prototypów, odbiorów SAT/FAT oraz zgłoszeń wad/reklamacji. Działa na
telefonie (zainstalowana z ekranu głównego) i na komputerze.

**Kluczowe założenie architektoniczne:** aplikacja jest **w 100% kliencka** —
brak backendu, brak logowania, brak kosztów serwerowych. Wszystkie dane
(raporty, zdjęcia, wideo) trzymane są **lokalnie na urządzeniu**. Pozostajemy
przy tym modelu aż do napotkania realnej ściany; backend (np. integracja z
SharePointem) tylko po wyraźnej decyzji biznesowej.

---

## 2. Stos technologiczny

| Warstwa | Technologia |
|---|---|
| UI | React 18, Tailwind CSS 3 |
| Bundler | Vite 5 |
| PWA / offline | vite-plugin-pwa + Workbox (`registerType: 'prompt'`) |
| Routing | własny, oparty o hash (`#/typ/id`) — bez react-router |
| Generowanie PDF | jsPDF 2.5.2 + jspdf-autotable 3.8.2 + osadzony font Roboto |
| Podgląd PDF w apce | pdf.js (pdfjs-dist 3.11.174) → render na `<canvas>` |
| Paczki ZIP / sync | JSZip |
| Drag & drop | @dnd-kit |
| Testy E2E | Playwright + pdf-parse (weryfikacja treści PDF) |
| Hosting | GitHub Pages + GitHub Actions |

---

## 3. Architektura i przepływ

- **`src/App.jsx`** — szkielet: nagłówek (logo, ⚙️ Ustawienia, ? Pomoc,
  przełącznik motywu, `VersionBadge`), routing po hashu, providery
  (`ErrorBoundary → ThemeProvider → SWProvider → ToastProvider`), prośba o
  trwałość pamięci (`navigator.storage.persist()`), wstępne ładowanie ciężkich
  bibliotek PDF w tle (`warmupLibs`).
- **Routing (hash):** `#/` (Home), `#/new`, `#/commissioning/:id`, `#/service/:id`,
  `#/prototype/:id`, `#/satfat/:id`, `#/complaint/:id`, `#/help`, `#/settings`.
- Każda strona raportu korzysta ze wspólnego hooka **`useReportPage`** i (poza
  reklamacją) ze wspólnego paska **`ReportActionBar`**.

---

## 4. Przechowywanie danych

### Raporty — `localStorage`
- Każdy raport pod własnym kluczem **`suresolutions.report.v2:<id>`**
  (wcześniej była jedna wielka tablica — autosave przepisywał całą bazę).
- W pamięci trzymany jest **cache** (czytany raz na sesję; zdarzenie `storage`
  z innej karty go unieważnia).
- **`SCHEMA_VERSION`** + `migrateReport()` — migracje kształtu danych przy
  odczycie (np. `service.observations` string → lista; `satfat.punchlist`
  uzupełnienie pola `media`).
- Plik: `src/utils/storage.js` (`loadAll`, `getById`, `upsert`, `remove`,
  `newId`, `cloneReport`).

### Media — IndexedDB `suresolutions.images.v1` (VERSION 4)
- `images` — miniatury 400×300 (dataURL, do UI i osadzenia w PDF),
- `originals` — pełne oryginały zdjęć (Blob, do paczki ZIP),
- `videos` — pliki wideo (Blob),
- `medium` — cache 1200×900 per `originalId` (do dużych zdjęć w PDF; liczone raz).
- Plik: `src/utils/imageStore.js`.

### Ustawienia — `localStorage` `suresolutions.settings.v1`
- `sharepointSubfolder` (domyślnie `08. Notesy`), e-mail zakupowca
  (`BUYER_EMAIL_KEY`). Plik: `src/utils/settings.js`, ekran `#/settings`.

---

## 5. Typy raportów (5)

| Typ | Trasa | Opis |
|---|---|---|
| **Uruchomienie / obserwacja maszyny** | `commissioning` | Sesja ze stoperem: start → logowanie zatrzymań na żywo → podsumowanie. |
| **Serwis na obiekcie** | `service` | Wizyta: dane wizyty, wykonane czynności, elementy do wymiany, obserwacje, rekomendacje. |
| **Testy prototypu / podzespołu** | `prototype` | Informacje o teście, warunki, punkty kontrolne (OK/NOK/warunkowo), decyzja. |
| **Odbiór SAT / FAT** | `satfat` | Uczestnicy, testy odbiorowe ze statusami, lista usterek (punchlist), status końcowy, podpisy stron. |
| **Reklamacja / zgłoszenie wady** | `complaint` | Duże zdjęcia-dowody wady, identyfikacja części, opis, wysyłka do zakupowca. |

### Specyfika raportu uruchomienia (commissioning)
- Fazy: `setup` (nagłówek + START) → `running`/`stopped` (timer na żywo, log
  zatrzymań) → `finished` (podsumowanie).
- **Obserwacje i wnioski/rekomendacje dostępne NA BIEŻĄCO** — już w trakcie
  sesji (Faza 2), nie tylko po jej zakończeniu (komponent `NotesSection`).
- **Każdy rekord zatrzymania jest edytowalny i usuwalny** — powód (w tym
  „Inne"), komentarz, media, godzina rozpoczęcia i czas trwania; edycja działa
  na żywo (auto-zapis), spójnie z resztą apki (`StopsTable` + modal edycji).

---

## 6. Generowanie PDF

Rdzeń: **`src/utils/pdf/core.js`** + 5 modułów per typ
(`service/commissioning/prototype/satfat/complaint.js`) + barrel
`src/utils/pdfGenerator.js`.

- **Natywny, kopiowalny tekst** (nie obraz): jsPDF + autotable + osadzony font
  **Roboto** (regular+bold). Dzięki ToUnicode tekst da się zaznaczać, kopiować,
  przeszukiwać (Ctrl+F) — także po polsku (ąćęłńóśżź). Pliki ~0,5 MB zamiast
  2–6 MB (poprzednio cały raport był rasterem z html2canvas).
- **Prymitywy** w core.js: `drawReportHeader` (logo), `drawMetaTable`,
  `drawSectionHeader` (keep-with-next), `drawStatCards`, `drawTable` (autotable
  z miniaturkami/badge/linkami w komórkach), `drawTextBlock`, `drawThumbsRow`,
  `drawEvidencePhotos`, `drawSignatures`, `drawBadge`, `drawVideosTable`,
  `drawBlockerBanner`, `drawPhotoAppendix`, `drawEmpty`.
- **Załącznik fotograficzny** (`drawPhotoAppendix`) — na końcu PDF WSZYSTKIE
  zdjęcia raportu DUŻE (~pół strony A4, proporcje zachowane), z podpisem
  (kontekst + opis) i linkiem do pliku w ZIP. Dzięki temu PDF jest
  samowystarczalny. Dodany do service/commissioning/prototype/satfat;
  **pominięty w reklamacji** (tam zdjęcia-dowody są już duże w treści).
- **Fabryka generatorów** (`makeReportGenerators`, v0.36) — każdy moduł deklaruje
  tylko `collectMedia`, funkcję rysującą `buildPdf` i `baseName`; fabryka tworzy
  `buildXPdf` i `buildXPackage` zwracające `{ blob, filename }` (bez pobierania).
  Usuwa powtarzalny boilerplate z 5 modułów.

### Podgląd PDF w aplikacji (`src/components/common/PdfPreview.jsx`, v0.35)
- Renderuje **ten sam, wygenerowany PDF** na `<canvas>` przez pdf.js —
  działa wszędzie, także na iOS (gdzie `<iframe>`/`<embed>` z PDF bywa pusty).
- pdf.js i worker ładowane **leniwie** (osobny chunk, wykluczony z precache),
  strony renderowane **na żądanie** (IntersectionObserver) — bezpieczne dla
  pamięci telefonu przy długich raportach.

---

## 7. Eksport, udostępnianie i wysyłka

Wspólny pasek **`ReportActionBar`** (poza reklamacją, która ma własny):

- **👁 Podgląd** — podgląd PDF w aplikacji (patrz wyżej).
- **Telefon (Web Share dostępny):** „📲 Udostępnij PDF" / „📦 Udostępnij ZIP" —
  wprost do systemowego okna (Teams/Mail/Pliki).
- **Komputer:** „📄 Pobierz PDF" / „📦 ZIP (PDF + zdjęcia)".
- **🔄 Przenieś na inne urządzenie** — paczka **synchronizacyjna** `.suresync`
  (ZIP z `report.json` + media) do przeniesienia raportu na inne urządzenie
  (import na Home). To NIE jest plik dla klienta — to kopia robocza do edycji.
- Reklamacja: dodatkowo **📤 Wyślij do zakupowca** (telefon → Web Share ZIP do
  Outlooka; komputer → pobranie ZIP + `mailto` z tematem/treścią).

Rozróżnienie: **PDF/ZIP = gotowy raport dla odbiorcy**; **.suresync = sync między
własnymi urządzeniami**. Wybór share vs pobranie steruje `canShareFiles()`
(`syncPackage.js`) — telefon udostępnia, desktop pobiera.

---

## 8. Funkcje wspólne

- **Auto-zapis** (`useAutoSave`) — debounce 300 ms, wskaźnik „Zapisano".
- **Walidacja przed eksportem** (`validateReport`) — modal z listą braków +
  scroll do pierwszej brakującej sekcji; można pobrać mimo to. (Podgląd NIE
  wymaga kompletu — można podejrzeć szkic.)
- **Blokada ukończonych** — status `completed` → `<fieldset disabled>` +
  `LockBanner` z „Odblokuj edycję"; pobieranie działa mimo blokady.
- **Zdjęcia/wideo** (`MediaUploader`) — aparat / galeria / nagrywanie;
  kompresja do miniatury + zapis oryginału; **adnotacje** (`PhotoAnnotator` —
  strzałki, kształty, tekst) tapnięciem w miniaturę.
- **Dyktowanie głosem** (`VoiceMic` / `MicTextarea`).
- **Drag & drop** kolejności (`SortableList`, @dnd-kit; long-press na mobile).
- **Tryb jasny/ciemny** (`ThemeContext`, bez FOUC).
- **Home** — lista raportów (stała kolejność wg `createdAt`), statystyki
  miesiąca, wyszukiwarka (debounced), multi-select z akcjami zbiorczymi
  (eksport/usuń), import paczki `.suresync`.
- **Onboarding** (jednorazowy tour) + **stała strona Pomocy** (`#/help`).
- **Ustawienia globalne** (`#/settings`) — podfolder SharePoint, e-mail
  zakupowca, wskaźnik pamięci urządzenia.

---

## 9. PWA / offline / aktualizacje

- Tryb **`prompt`** — nowa wersja czeka w „waiting", baner `UpdatePrompt`
  proponuje „Odśwież" (skipWaiting + reload). Kliknięcie `VersionBadge` ręcznie
  sprawdza aktualizacje.
- **Precache** (Workbox): kod + font Roboto (świadomie, do generowania PDF
  offline). **Wykluczone z precache**: martwe opcjonalne zależności jsPDF
  (`index.es`, `purify.es`, `html2canvas`) oraz **pdf.js + worker** (~1,3 MB —
  ładowane online dopiero przy 1. podglądzie).
- Instalacja PWA z ekranu głównego (`InstallPrompt`).

---

## 10. Struktura plików (`src/`)

```
App.jsx                     # szkielet, routing, providery, VersionBadge
main.jsx                    # punkt wejścia
pages/
  Home.jsx                  # lista raportów, statystyki, multi-select, import/eksport sync
  NewReport.jsx             # wybór typu raportu
  Help.jsx                  # pomoc
  Settings.jsx              # ustawienia globalne
components/
  reports/                  # 5 komponentów: Commissioning/Service/Prototype/SatFat/Complaint
  common/                   # Header, MediaUploader, PhotoAnnotator, VoiceMic, AutoSaveIndicator,
                            # ReportActionBar (+LockBanner), LoadingOverlay, PdfPreview, ErrorBoundary,
                            # Toast, SWManager, ThemeContext, InstallPrompt, UpdatePrompt,
                            # OnboardingTour, SortableList, ToggleGroup, SuggestInput,
                            # PackageImportDialog, SectionNav, EmptyState
utils/
  storage.js                # raporty (localStorage per-klucz + cache + migracje)
  imageStore.js             # media w IndexedDB
  settings.js               # ustawienia
  useReportPage.js          # wspólny hook strony raportu (download/share/preview)
  useAutoSave.js            # debounced autosave
  validateReport.js         # walidacja przed eksportem
  syncPackage.js            # paczki .suresync + helpery Web Share + canShareFiles
  pdfGenerator.js           # barrel API generowania
  pdf/
    core.js                 # silnik PDF + prymitywy + buildReportPdf + makeReportGenerators
    service.js commissioning.js prototype.js satfat.js complaint.js
    fonts/roboto-regular.js roboto-bold.js   # font base64 (lazy)
  suggestions.js            # źródła autouzupełniania
  imageCompressor.js        # kompresja zdjęć
assets/logo.png
```

---

## 11. Build, testy, deploy

- **Dev:** `npm run dev` (Vite, port 5173). **Build:** `npm run build`.
  **Testy E2E:** `npm run test:e2e` (Playwright).
- **Smoke testy** (`tests/smoke.spec.js`): ładowanie Home; serwisowy PDF z
  natywnym tekstem + polskie znaki; osobny PDF vs ZIP + załącznik dużych zdjęć;
  podgląd PDF w apce renderuje strony. `beforeEach` wyłącza Web Share, by
  deterministycznie pojawiały się przyciski „Pobierz".
- **CI/CD:** GitHub Actions buduje, instaluje Chromium, uruchamia smoke testy i
  publikuje na GitHub Pages (deploy bramkowany testami).

---

## 12. Wersjonowanie

**Reguła:** każda zmiana kodu trafiająca do użytkownika MUSI podbić numer wersji
widoczny w `VersionBadge` (`src/App.jsx`) **oraz** w `package.json`. Numer służy
użytkownikowi do potwierdzenia, że PWA pobrała aktualizację.

**Aktualna wersja: v0.36.** Skrót ostatnich zmian:
- **v0.36** — refaktoryzacja: fabryka `makeReportGenerators` usuwa powtarzalny
  boilerplate build* w 5 modułach PDF; pełny audyt obecności funkcji
  v0.32–v0.35 we wszystkich typach; ten dokument.
- **v0.35** — podgląd PDF w aplikacji (pdf.js → canvas).
- **v0.34** — udostępnianie wprost do Teams/Maila (Web Share) + osobne buildery
  `{blob,filename}`.
- **v0.33** — osobny przycisk „Pobierz PDF" obok ZIP + załącznik dużych zdjęć.
- **v0.32** — raport uruchomienia: obserwacje na bieżąco + edycja/usuwanie
  rekordów zatrzymań.
- **v0.31** — PDF jako natywny, kopiowalny tekst (jsPDF + Roboto).
- **v0.30** — pakiet niezawodności/wydajności/struktury (ErrorBoundary, storage
  per-klucz, cache medium-res, hook `useReportPage`, smoke testy w CI, lock
  ukończonych, statystyki + multi-select na Home).
- **v0.1–v0.29** — pełna historia w pamięci asystenta
  (`suresolutions_report_app_versioning.md`).

---

## 13. Znane ograniczenia

- **Teams na iOS — „Nie można przekazać pliku".** To problem **Teams / Microsoft
  365 (OneDrive)**, NIE aplikacji — powtarza się nawet przy ręcznym załączaniu
  zapisanego pliku w Teams. Teams wrzuca pliki z czatu do OneDrive nadawcy; bez
  działającego/licencjonowanego OneDrive upload się nie powiedzie. Dodatkowo
  Teams często **nie pojawia się** w oknie udostępniania iOS dla plików (jego
  ograniczenie). Obejścia: wysyłka **mailem (Outlook)** lub link z OneDrive;
  docelowo naprawa OneDrive przez admina M365.
- **Podgląd offline** — pdf.js ładuje się online przy pierwszym użyciu (świadomie
  poza precache); offline podgląd pokaże błąd z sugestią pobrania PDF.
- **Duże raporty** — wiele zdjęć w załączniku zwiększa rozmiar PDF (kompromis:
  samowystarczalny plik vs waga).
- **Dane lokalne** — wyczyszczenie danych przeglądarki = utrata raportów.
  Do przenoszenia/backupu służy paczka `.suresync`. iOS Safari potrafi czyścić
  IndexedDB po ~7 dniach nieużywania, chyba że PWA jest dodana do ekranu głównego.
- **Voice-to-text** wysyła audio do serwera przeglądarki (Google/Apple/MS);
  Firefox nie wspiera Web Speech API (graceful fallback).

---

## 14. Kierunki rozwoju (opcjonalne)

- **Integracja z SharePointem** — apka po zakończeniu raportu wrzucałaby PDF/ZIP
  na firmowy SharePoint (MS Graph). Wymaga rejestracji w Entra ID — instrukcje w
  `INSTRUKCJA-ENTRA.md`, plan w `PLAN-SHAREPOINT.md`. Najmniej inwazyjny backend
  (używa istniejącego M365, dane nie wypływają na zewnątrz).
- **Backup/eksport historii** (XLSX, pełny backup bazy) — substytut dashboardu
  właściciela bez wychodzenia z architektury klienckiej.
- **Subset fontu Roboto** (~168→60 KB) — mikrooptymalizacja precache.
- **Przełącznik „dołączaj duże zdjęcia do PDF"** / limit rozdzielczości
  załącznika — gdyby waga PDF była problemem.
- **Wyjście z architektury** (mały backend / sync) — tylko po wyraźnej decyzji,
  gdy obecny model klient-only realnie zacznie blokować pracę zespołu.
