# Raporty SURE — dokumentacja aplikacji

> Aktualny, kompletny opis aplikacji. Stan na **v0.53**.
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
| Eksport rejestru (XLSX) | SheetJS (`xlsx`) — leniwie, wykluczony z precache |
| Drag & drop | @dnd-kit |
| Testy E2E | Playwright + pdf-parse (weryfikacja treści PDF) |
| Hosting | GitHub Pages + GitHub Actions |

---

## 3. Architektura i przepływ

- **`src/App.jsx`** — szkielet: nagłówek (logo, ⚙️ Ustawienia, przełącznik
  motywu, `VersionBadge`), routing po hashu, providery
  (`ErrorBoundary → ThemeProvider → SWProvider → ToastProvider`), prośba o
  trwałość pamięci (`navigator.storage.persist()`), wstępne ładowanie ciężkich
  bibliotek PDF w tle (`warmupLibs`), bezczynne sprzątanie osieroconych blobów
  (`sweepOrphanedMedia`, patrz §4) oraz globalny baner ostrzeżeń o pamięci
  (`StorageAlerts`).
- **Dolny pasek nawigacji** (`TabBar`, v0.42): `Start / 🗂 Raporty / Pomoc` —
  wzorzec zainstalowanej aplikacji mobilnej (strefa kciuka, safe-area na iOS).
  Widoczny tylko na ekranach najwyższego poziomu (`TAB_ROUTES`); formularze
  raportów go chowają (drill-down z „← Strona główna"). „?" zniknął z nagłówka
  (Pomoc jest zakładką).
- **Routing (hash):** `#/` (Start), `#/reports` (lista), `#/new`,
  `#/commissioning/:id`, `#/service/:id`, `#/prototype/:id`, `#/satfat/:id`,
  `#/complaint/:id`, `#/lesson/:id`, `#/help`, `#/settings`.
- **Strefy typów** (`src/utils/reportMeta.js`, v0.42) — jedno źródło prawdy
  (labels/ikony/kategorie/akcenty): **🏢 Dla klienta** (niebieski `sure-blue`:
  serwis, SAT/FAT, uruchomienie) i **🔒 Wewnętrzne** (fiolet: prototyp, lekcja
  projektowa, reklamacja — idzie do zakupowca, klient jej nie widzi). Kolor
  strefy = język wizualny: akcent kart listy, chipy, segment, strefy w `#/new`.
- Każda strona raportu korzysta ze wspólnego hooka **`useReportPage`** i (poza
  reklamacją) ze wspólnego paska **`ReportActionBar`**.

---

## 4. Przechowywanie danych

### Raporty — `localStorage`
- Każdy raport pod własnym kluczem **`suresolutions.report.v2:<id>`**
  (wcześniej była jedna wielka tablica — autosave przepisywał całą bazę).
- W pamięci trzymany jest **cache** (czytany raz na sesję; zdarzenie `storage`
  z innej karty go unieważnia).
- **`SCHEMA_VERSION` = 4** + `migrateReport()` — kumulatywne, idempotentne
  migracje kształtu danych przy odczycie (trwałe przy najbliższym zapisie):
  - v0→v1: `service.observations` string→lista, `satfat.punchlist` pole `media`;
  - v1→v2: `service.recommendations`, `commissioning.observations` i
    `.conclusions` string→lista rekordów;
  - v2→v3: `satfat.conclusions` string→lista rekordów;
  - v3→v4 (v0.52): **klient i lokalizacja → `header`** (przedtem `service.visit`
    i `satfat.info`; uruchomienie/prototyp/lekcja nie miały ich wcale, więc
    wypadały z analiz „per klient"). Stare klucze są USUWANE, żeby nie powstały
    dwa źródła prawdy. Resolvery `src/utils/reportFields.js`
    (`reportClient`, `reportLocation`, `reportTimeRange`, `reportMinutes`)
    czytają nowe miejsce z fallbackiem na stare — dla paczek `.suresync`
    zaimportowanych ze starszej wersji apki.
  Helper `strToRecords()` zamienia stare pola tekstowe na listę `[{id,text,media}]`.
- Plik: `src/utils/storage.js` (`loadAll`, `getById`, `upsert`, `remove`,
  `newId`, `cloneReport`). `cloneReport` (duplikat raportu) dla każdego typu
  przelicza numer raportu z zachowanego numeru projektu (`URU-/RPT-/FAT-/SAT-/PRT-/REK-/LL-`).

### Media — IndexedDB `suresolutions.images.v1` (VERSION 4)
- `images` — miniatury 400×300 (dataURL, do UI i osadzenia w PDF),
- `originals` — pełne oryginały zdjęć (Blob, do paczki ZIP); tu też leży
  **czysta baza edycji** adnotacji (`editBaseId`, patrz niżej),
- `videos` — pliki wideo (Blob),
- `medium` — cache 1200×900 per `originalId` (do dużych zdjęć w PDF; liczone raz).
- Plik: `src/utils/imageStore.js`.
- **Nie-destrukcyjne adnotacje (v0.46):** element media zdjęcia trzyma trzy
  powiązane artefakty — `originalId` (obraz SPŁASZCZONY z wypalonymi uwagami, do
  ZIP/PDF), `editBaseId` (CZYSTA baza bez uwag) i `shapes` (wektorowe adnotacje w
  `report.json`). Ponowne otwarcie edytora wczytuje czystą bazę + kształty, więc
  uwagi da się poprawić/usunąć po wyjściu (patrz §8, PhotoAnnotator).

### Bezpieczeństwo danych (v0.47)
Jedyna kopia raportów to urządzenie, więc warstwa ochronna pilnuje, by praca nie
przepadła po cichu:
- **Twardy błąd zapisu (quota).** Gdy `localStorage` jest pełny, `upsert` emituje
  zdarzenie `suresolutions:storage-full`; komponent `StorageAlerts` pokazuje
  uporczywy czerwony baner „Pamięć pełna" z przyciskiem backupu (wcześniej
  autosave tylko logował błąd i „udawał sukces" — zmiany ginęły po reloadzie).
- **Przypomnienie o backupie.** Pulpit (Start) przypomina o kopii, gdy jest
  ≥3 raporty i brak backupu lub minęło >14 dni (`getLastBackupAt`/`setLastBackupAt`,
  osobny klucz `suresolutions.lastBackupAt`); ostrzega też przy >85% zapełnienia
  pamięci (`getStorageEstimate`).
- **GC osieroconych blobów** (`sweepOrphanedMedia`, wołane bezczynnie przy
  starcie): usunięcie zdjęcia/rekordu w raporcie kasowało dotąd tylko referencję
  w JSON, nie blob w IndexedDB — teraz martwe zdjęcia/miniatury/wideo bez żadnej
  referencji są sprzątane (zbiór referencji z `collectMediaIds` po wszystkich
  raportach; `editBaseId` też jest liczony jako referencja).
- Wspólny `backupAllReports()` (buduje paczkę + udostępnia/pobiera + stempluje
  znacznik); nazwa backupu z godziną (koniec kolizji kilku kopii tego samego dnia).

### Ustawienia — `localStorage` `suresolutions.settings.v1`
- `sharepointSubfolder` (domyślnie `08. Notesy`), e-mail zakupowca
  (`BUYER_EMAIL_KEY`, osobny klucz współdzielony z reklamacją),
  **`defaultAuthor` + `defaultRole`** (podpowiadane w nowych raportach na tym
  urządzeniu — każdy z zespołu ustawia raz i nie wpisuje w kółko),
  **`stopReasons`** (konfigurowalna lista powodów zatrzymań w raporcie
  uruchomienia; „Inne" doklejane zawsze), **`lessonCategories`** (konfigurowalne
  kategorie błędu w lekcji projektowej). Helpery: `getDefaultAuthor()`,
  `getDefaultRole()`, `getStopReasons()`, `getLessonCategories()`; stałe
  `ROLE_OPTIONS`, `DEFAULT_STOP_REASONS`, `DEFAULT_LESSON_CATEGORIES`,
  `LESSON_SEVERITIES`, `LESSON_STAGES`. Plik: `src/utils/settings.js`, ekran `#/settings`.

---

## 5. Typy raportów (6)

| Typ | Trasa | Opis |
|---|---|---|
| **Uruchomienie / obserwacja maszyny** | `commissioning` | Sesja ze stoperem: start → logowanie zatrzymań na żywo → podsumowanie. |
| **Serwis na obiekcie** | `service` | Wizyta: dane wizyty, liczba obecnych, wykonane czynności, elementy do wymiany, obserwacje, rekomendacje. |
| **Testy prototypu / podzespołu** | `prototype` | Informacje o teście, warunki, punkty kontrolne (OK/NOK/warunkowo), decyzja. |
| **Odbiór SAT / FAT** | `satfat` | Uczestnicy, testy odbiorowe ze statusami, lista usterek (punchlist), wnioski, status końcowy, podpisy stron. |
| **Reklamacja / zgłoszenie wady** | `complaint` | Duże zdjęcia-dowody wady, identyfikacja części, opis, wysyłka do zakupowca. |
| **Lekcja projektowa** | `lesson` | Feedback błędu projektowego do konstrukcji (Lessons Learned): kontekst, opis błędu, kategoria + istotność, skutek, wnioski. Rejestr z eksportem do Excela. |

### Automatyczna numeracja (wszystkie typy poza reklamacją mają auto-numer)
Użytkownik podaje **numer projektu** (np. `25-104`), a numer raportu tworzy się
sam wg wzorca `{PREFIX}-{nr projektu}-{data}`: `URU-` (uruchomienie), `RPT-`
(serwis), `PRT-` (prototyp), `FAT-`/`SAT-` (odbiór — zależnie od typu testu),
`LL-` (lekcja projektowa), `REK-` (reklamacja). Logika w `Header.jsx`
(`autoNumber`) + `computeReportNumber` w komponentach; walidacja żąda „Numeru
projektu" (nie „Numeru raportu").

### Rekordy powtarzalne (`NotesList`)
Obserwacje, rekomendacje i wnioski to **listy rekordów** `[{id, text, media}]`,
nie pojedyncze pola tekstowe — dodajesz kolejne wpisy przyciskiem „+ Dodaj",
każdy z własnym zdjęciem, dyktowaniem i zmianą kolejności. Wspólny komponent
**`src/components/common/NotesList.jsx`** obsługuje: serwis (obserwacje +
rekomendacje), uruchomienie (obserwacje + wnioski), SAT/FAT (wnioski), lekcja
projektowa (wnioski/rekomendacje dla konstrukcji).

### Specyfika raportu uruchomienia (commissioning)
- Fazy: `setup` (nagłówek + START) → `running`/`stopped` (timer na żywo, log
  zatrzymań) → `finished` (podsumowanie).
- **Obserwacje i wnioski dostępne NA BIEŻĄCO** — już w trakcie sesji (Faza 2),
  nie tylko po jej zakończeniu (komponent `NotesSection` → dwa `NotesList`).
- **Powody zatrzymań konfigurowalne** w Ustawieniach (`getStopReasons()` + „Inne").
- **Każdy rekord zatrzymania jest edytowalny i usuwalny** — powód (w tym
  „Inne"), komentarz, media, godzina rozpoczęcia i czas trwania; edycja działa
  na żywo (auto-zapis), spójnie z resztą apki (`StopsTable` + modal edycji).
- **Ręczne dodanie zatrzymania** (v0.49) — „+ Dodaj zatrzymanie ręcznie" tworzy
  rekord i otwiera modal korekty czasu/powodu (gdy inżynier zapomni kliknąć na
  żywo).
- **Wake Lock** (v0.48, `useWakeLock`) — w fazach `running`/`stopped` ekran nie
  gaśnie podczas obserwacji maszyny z live-timerem.

### Specyfika raportu serwisowego (service)
- **„⏱ Teraz"** przy godzinie przyjazdu i odjazdu — jedno tapnięcie wstawia
  bieżącą godzinę (`nowHHMM()` z `utils/time.js`).
- **Liczba osób obecnych na serwisie** (`visit.attendees`) — w sekcji danych
  wizyty i w PDF.
- **Ilość sztuk przy elemencie do wymiany** (`parts[].qty`, v0.52) — obok numeru
  katalogowego, kolumna „Szt." w PDF. Bez niej Pareto zużycia części liczyło
  tylko wystąpienia, nie sztuki.
- **Kilometry dojazdu** (`visit.travelKm`, v0.53) — patrz niżej.
- **Domyślny autor i rola** z Ustawień podpowiadane w nowym raporcie.

### Kilometry dojazdu (v0.53)
`visit.travelKm` przechowuje **łączny dystans w obie strony** — to ta liczba idzie
do rozliczenia, więc jedna wartość zamiast pary „w jedną stronę + przelicznik"
(dwa pola = dwa stany do pilnowania i niejasność w PDF, co właściwie znaczy
liczba). Odczyt i formatowanie w jednym miejscu: `travelKm()` / `travelKmLabel()`
w `utils/reportFields.js` — używają ich formularz, PDF i eksport.

**Dlaczego pole, a nie suwak.** Wartość jest rozliczeniowa, więc musi być dokładna
co do kilometra, a zakres to 0–kilkaset km: suwak na telefonie daje błąd rzędu
±10 km, nie pozwala wpisać liczby z klawiatury i i tak wymaga pokazania wartości
obok. Wygodę robią zamiast tego **chipy z historii** (`suggestTravelKm(client)`) —
dystans do danego klienta jest stały, więc druga i każda kolejna wizyta u niego to
jedno tapnięcie; najpierw wartości z wizyt u TEGO klienta, potem pozostałe.
Przycisk „×2" (podwajanie odległości w jedną stronę) był w propozycji, ale
**użytkownik uznał go za zbędny** — nie wracać do pomysłu.

Pod sekcją A wartość wraca echem obok czasu wizyty („Łączny czas wizyty: 2 h 30 min
· Dojazd: 128 km"). W PDF stoi jako **czwarta komórka** wiersza z godzinami
(`PRZYJAZD | ODJAZD | ŁĄCZNY CZAS | DOJAZD`) — `drawMetaTable` liczy szerokości
per wiersz, więc wiersz może mieć dowolną liczbę komórek. W eksporcie
analitycznym: kolumna `Dojazd [km]` / `dojazd_km` jako **liczba bez jednostki**
(jednostka w nagłówku), pusta gdy nie podano. Pole jest **opcjonalne** — nie
wchodzi do bramki kompletności, żeby nie unieważniać raportów tych, którzy km nie
rozliczają. `cloneReport` (duplikat wizyty) **zachowuje** kilometry, bo dystans do
tego samego klienta się nie zmienia.

### Klient i lokalizacja — pola przekrojowe (v0.52)
`header.client` i `header.location` są **wspólne dla wszystkich typów**
(migracja v3→v4, patrz §4). Miejsce edycji zostało tam, gdzie było w UI:
serwis i SAT/FAT mają je w swojej sekcji A, a uruchomienie, prototyp i lekcja
dostały opcjonalne pole **„Klient"** we wspólnym nagłówku (`Header` + prop
`showClient`). Podpowiedzi klienta i lokalizacji (`suggestClients`,
`suggestLocations`) zbierają się teraz z **wszystkich** typów, nie tylko z
serwisu. Klient trafił też do PDF uruchomienia, prototypu i lekcji oraz do
rejestru lekcji XLSX.

### Godziny odbioru i testu (v0.52)
SAT/FAT (`info.startTime`/`endTime`) i prototyp (to samo w `info`) mają godziny
„od–do" z przyciskiem „⏱ Teraz" i wyliczonym czasem trwania pod spodem — bez nich
nie dało się zmierzyć, ile trwa odbiór ani ile czasu zjada iteracja prototypu.
Arytmetyka czasu (`minutesBetween`, `durationLabel`) mieszka w
**`src/utils/time.js`** — jedno źródło dla formularzy, PDF-ów, pulpitu i eksportu
analitycznego (przedtem trzy kopie tej samej funkcji).

### Specyfika reklamacji (complaint)
- **Dostawca** (`supplier`, v0.52) — pole w Identyfikacji, wiersz w PDF (zawsze
  widoczny, pusty pokazuje „—") i w treści maila do zakupowca. Bez niego nie dało
  się zestawić reklamacji per dostawca.

### Specyfika lekcji projektowej (lesson, v0.40)
- **Cel:** zamknięcie pętli teren → konstrukcja. Błąd projektowy wykryty przy
  uruchomieniu/serwisie trafia jako trwały wpis do konstrukcji (Lessons Learned).
- **Pola:** kontekst (etap wykrycia `stage`, nr rysunku `drawingNo`), opis błędu
  (`problem` + zdjęcia), klasyfikacja (`category` — konfigurowalna lista + „Inne";
  `severity` — krytyczny/poważny/drobny), skutek (`impact`), wnioski (`lessons` —
  rekordy `NotesList`).
- **„Baza" bez SharePointa:** PDF to karta pojedynczej lekcji; kategoryzowalny
  rejestr powstaje z ustrukturyzowanych danych — filtrowanie na Home + **eksport
  wszystkich lekcji do XLSX** (patrz §7). Świadoma decyzja: PDF ≠ baza.

---

## 6. Generowanie PDF

Rdzeń: **`src/utils/pdf/core.js`** + 6 modułów per typ
(`service/commissioning/prototype/satfat/complaint/lesson.js`) + barrel
`src/utils/pdfGenerator.js`.

- **Natywny, kopiowalny tekst** (nie obraz): jsPDF + autotable + osadzony font
  **Roboto** (regular+bold). Dzięki ToUnicode tekst da się zaznaczać, kopiować,
  przeszukiwać (Ctrl+F) — także po polsku (ąćęłńóśżź). Pliki ~0,5 MB zamiast
  2–6 MB (poprzednio cały raport był rasterem z html2canvas).
- **Prymitywy** w core.js: `drawReportHeader` (logo), `drawMetaTable`,
  `drawSectionHeader` (keep-with-next), `drawStatCards`, `drawTable` (autotable
  z miniaturkami/badge w komórkach), `drawTextBlock`, `drawThumbsRow`,
  `drawEvidencePhotos`, `drawSignatures`, `drawBadge`, `drawVideosTable`,
  `drawBlockerBanner`, `drawPhotoAppendix`, `drawEmpty`.
- **Załącznik fotograficzny** (`drawPhotoAppendix`) — na końcu PDF WSZYSTKIE
  zdjęcia raportu DUŻE (~pół strony A4, proporcje zachowane), z podpisem
  (kontekst + opis). Dzięki temu PDF jest samowystarczalny. Dodany do
  service/commissioning/prototype/satfat; **pominięty w reklamacji** (tam
  zdjęcia-dowody są już duże w treści).
- **Bez hiperłączy na zdjęciach** (v0.37) — miniaturki i duże zdjęcia w PDF nie
  są już klikalnymi linkami (mylące dla odbiorcy, bo prowadziły do plików w ZIP).
  Link zostaje wyłącznie przy **nazwie pliku wideo** (wideo nie da się osadzić w PDF).
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

Wspólny pasek **`ReportActionBar`** (poza reklamacją, która ma własny),
w trzech rzędach:

- **Rząd 1 (zawsze):** „👁 Podgląd" (podgląd PDF w aplikacji, patrz wyżej) +
  „💾 Zapisz PDF na urządzenie" (zapis lekkiego PDF na dysk komputera / do Plików
  telefonu — najlepszy do wysyłki).
- **Rząd 2 — telefon (Web Share dostępny):** „📲 Udostępnij PDF" +
  „📦 Udostępnij ZIP" — wprost do systemowego okna (Teams/Mail/Pliki).
- **Rząd 2 — komputer:** „📦 Zapisz ZIP" + **„✉️ Wyślij mailem"** (pobiera PDF
  i otwiera Outlooka z gotowym tematem — załączasz pobrany plik).
- **Rząd 3:** „✓ Oznacz ukończony" (jeśli dotyczy) + „🔄 Przenieś na inne
  urządzenie" + „Zapisz i wyjdź".

**🔄 Przenieś na inne urządzenie** — paczka **synchronizacyjna** `.suresync`
(ZIP z `report.json` + media) do przeniesienia raportu na inne urządzenie
(import na Home). To NIE jest plik dla klienta — to kopia robocza do edycji.

Reklamacja (własny pasek): dodatkowo **📤 Wyślij do zakupowca** (telefon → Web
Share ZIP do Outlooka; komputer → pobranie ZIP + `mailto` z tematem/treścią).

Rozróżnienie: **PDF/ZIP = gotowy raport dla odbiorcy**; **.suresync = sync między
własnymi urządzeniami**. Wybór share vs pobranie steruje `canShareFiles()`
(`syncPackage.js`) — telefon udostępnia, desktop pobiera i podpowiada mail.
Nazwa pliku = numer raportu (bez podwójnej daty — `fileBase` w `core.js`).

### Rejestr lekcji projektowych → XLSX (v0.40)
Osobna ścieżka eksportu (nie PDF): na Home przycisk **„📊 Rejestr lekcji → Excel
(XLSX)"** (widoczny gdy istnieje ≥1 lekcja) zbiera WSZYSTKIE lekcje w jeden
arkusz — wiersz = lekcja, kolumny = pola (numer, data, projekt, maszyna, nr
rysunku, etap, kategoria, istotność, opis, skutek, wnioski, liczba zdjęć, autor,
status), z autofiltrem. To filtrowalna „baza" bez backendu (sort/filtr/tabela
przestawna w Excelu lub Power BI). Silnik: `utils/registerExport.js` + SheetJS
(`xlsx`, leniwie). Telefon → udostępnij, desktop → pobierz (`canShareFiles`).
- **Przeglądanie rejestru w apce (v0.41):** po włączeniu filtra „🎓 Lekcja" na
  Home pojawia się kontekstowy wiersz podfiltrów — chipy **kategorii** (brane z
  danych) + **istotności**; rejestr filtrujesz też bez Excela. Podfiltry czyszczą
  się po wyłączeniu filtra „Lekcja".
- **Eksport z zaznaczonych (v0.41):** w trybie multi-select przycisk „📊 Rejestr"
  eksportuje XLSX tylko z zaznaczonych lekcji (`handleExportRegister(subset)`).

### Eksport ANALITYCZNY — cała baza w płaskich tabelach (v0.52)
Silnik: **`src/utils/analyticsExport.js`**. Wejście z menu ⋯ na zakładce Raporty
(sekcja „Analiza"): **„📈 Eksport analityczny → Excel"** i **„🧾 … → JSONL"**.
Zawsze obejmuje WSZYSTKIE raporty (nie zaznaczony podzbiór — sens analizy jest w
pełnej historii).

**Dlaczego osobna warstwa:** PDF jest dokumentem, a raport w localStorage
zagnieżdżonym JSON-em — żadne z tego nie wchodzi do tabeli przestawnej. Moduł
WYLICZA z raportów gwiazdę i jest warstwą **pochodną**: można ją przebudować bez
migracji i bez ryzyka dla danych z terenu.

Struktura (jedna definicja kolumn → dwa formaty; każda kolumna ma `key` = polski
nagłówek do XLSX i `id` = ASCII snake_case do JSONL):
- **`Raporty`** — tabela faktów, 1 wiersz = 1 raport: identyfikacja (report_id,
  typ, numer, data, rok, miesiąc, projekt, maszyna, klient, lokalizacja, autor,
  status) + miary wspólne (czas w minutach, zdjęcia, wideo, wpisy opisowe) +
  bloki per typ: serwis (czynności, części, części pilne, sztuki, rola, osoby
  obecne, **dojazd [km]**, status wizyty), uruchomienie (zatrzymania, czas zatrzymań, najdłuższe,
  **dostępność %**, **MTBF**, **MTTR**), SAT/FAT (testy pass/fail/cond/na,
  **FPY %**, usterki, usterki krytyczne, wynik odbioru, uczestnicy), prototyp
  (podzespół, iteracja, metoda próbki, punkty OK/NOK/warunkowo, ocena, decyzja),
  lekcja (etap, kategoria, istotność, nr rysunku), reklamacja (część, dostawca,
  kategoria wady, blokuje montaż).
- **tabele-dzieci** (pomijane, gdy puste): `Zatrzymania`, `Czynności`, `Części`,
  `Testy`, `Usterki`, `Punkty prototypu`, `Parametry`, `Notatki` (obserwacje +
  rekomendacje + wnioski z kolumną „Źródło"). Każdy wiersz dziecka wiezie
  `report_id` + numer + datę + nr projektu + maszynę + klienta — **redundancja
  celowa**, żeby każdy arkusz pivotował się samodzielnie, bez relacji.
- **`Info`** — data eksportu, wersja apki, wersja schematu, liczniki wierszy oraz
  spis konwencji i definicji wskaźników (dostępność, MTBF/MTTR, FPY).

Konwencje danych (celowe, żeby arkusz dał się analizować też za dwa lata):
surowe wartości zamiast sformatowanych (**czas w minutach jako liczba**, nie
„3 h 20 min"), **klucz + etykieta w osobnych kolumnach** (`istotnosc_key=critical`
obok `Istotność=Krytyczny`), daty `YYYY-MM-DD` i znaczniki ISO 8601, **pusta
komórka = „nie dotyczy", NIE zero** (inaczej średnie kłamią), autofiltr na każdym
arkuszu, nazwa pliku z datą i godziną (`analiza-raportow_2026-07-24_1432.xlsx`) —
eksporty się nie nadpisują, więc folder w OneDrive staje się szeregiem czasowym
bez backendu.

Definicje wskaźników: **dostępność** = (czas sesji − czas zatrzymań) / czas
sesji; **MTBF** = czas sesji / liczba zatrzymań; **MTTR** = czas zatrzymań /
liczba zatrzymań; **FPY** = testy zaliczone / (wszystkie − N/A). Przy
zatrzymaniach kolumna `Powód` ma podstawiony tekst z „Inne", a `powod_slownik`
surową wartość — dzięki temu widać udział „Inne" i wiadomo, czym uzupełnić
słownik w Ustawieniach. Test `tests/smoke.spec.js` weryfikuje te wyliczenia
end-to-end (dostępność 92,5%, MTTR 4,5, MTBF 60, sumę sztuk części) oraz
migrację klienta v3→v4.

JSONL: 1 linia = 1 raport z **zagnieżdżonymi** dziećmi, klucze snake_case, każda
linia stemplowana wersją apki i datą eksportu (samoopisująca się nawet po
sklejeniu plików z wielu miesięcy). To ścieżka do Power BI / Pythona, więc
pobiera się wprost, bez okna „udostępnij".

**Stan wątku:** to komplet tego, co zaplanowano na tym etapie — pulpit „Analiza"
w apce i Power BI nad folderem w OneDrive są świadomie odłożone (patrz §14).
**Uwaga przy pierwszym eksporcie:** historyczne raporty nie mają pól dodanych w
v0.52 i v0.53 (dostawca, sztuki, godziny odbioru/testu, kilometry dojazdu) — te
kolumny będą puste i zapełnią się dopiero nowymi raportami. Klient dla serwisu i SAT/FAT zmigrował
się automatycznie (v3→v4), więc historia „per klient" działa wstecz dla tych
dwóch typów.

---

## 8. Funkcje wspólne

- **Auto-zapis** (`useAutoSave`) — debounce 300 ms, wskaźnik „Zapisano".
- **Walidacja przed eksportem** (`validateReport`) — modal z listą braków +
  scroll do pierwszej brakującej sekcji; można pobrać mimo to. (Podgląd NIE
  wymaga kompletu — można podejrzeć szkic.)
- **Live wskaźnik kompletności** (v0.48) — w sticky pasku sekcji (`SectionNav`)
  pasek postępu + „Brakuje N · X/Y" lub „✓ Kompletny"; tapnięcie skacze do
  pierwszego braku. Liczony z tego samego `validateReport` (jedno źródło —
  `buildChecks` zwraca `total`/`filled`), więc wskaźnik i bramka pobierania nigdy
  się nie rozjadą. Serwis/prototyp/SAT-FAT/lekcja (uruchomienie jest fazowe,
  reklamacja to lean-form — bez paska).
- **Blokada ukończonych** — status `completed` → `<fieldset disabled>` +
  `LockBanner` z „Odblokuj edycję"; pobieranie działa mimo blokady.
- **Zdjęcia/wideo** (`MediaUploader`) — aparat / galeria / nagrywanie;
  kompresja do miniatury + zapis oryginału; **edytor adnotacji**
  (`PhotoAnnotator`) tapnięciem w miniaturę: strzałki, kółka, prostokąty,
  rysowanie odręczne, **tekst w miejscu**; **zoom (szczypanie / kółko myszy) +
  przesuwanie** do precyzyjnych adnotacji na zdjęciach z telefonu;
  **undo/redo** całej historii; **kadrowanie** i **obrót 90°**; zapis zachowuje
  jakość (PNG bezstratnie, JPEG 0.92 — bez degradacji przy wielokrotnej edycji).
  Adnotacje są **nie-destrukcyjne** — po wyjściu z edytora można wrócić i
  poprawić/usunąć naniesione uwagi (czysta baza + wektorowe kształty są
  zapisywane obok spłaszczonej wersji eksportowej).
- **Dyktowanie głosem** (`VoiceMic`) — w polach wielolinijkowych (`MicTextarea`)
  oraz, od v0.49, w opisowych polach jednoliniowych (`MicInput`): kryterium
  akceptacji SAT/FAT, komentarz punktu prototypu, komentarz części serwisu.
  Bez wsparcia Web Speech (Firefox) pola działają normalnie (graceful fallback).
- **Chipy autouzupełniania** (`SuggestInput`) — pola powtarzalne (klient,
  lokalizacja, numer/nazwa projektu, maszyna, autor, komponent, części) po
  wejściu w fokus pokazują **tapowalne podpowiedzi z historii** raportów
  (`suggestions.js`); tapnięcie wypełnia pole. Filtrowane po wpisywanym tekście.
- **Rekordy powtarzalne** (`NotesList`) — obserwacje/rekomendacje/wnioski jako
  lista wpisów „+ Dodaj", każdy ze zdjęciem i dyktowaniem (patrz sekcja 5).
- **Domyślny autor i rola** — prefill nowych raportów z Ustawień.
- **Drag & drop** kolejności (`SortableList`, @dnd-kit; long-press na mobile).
- **Tryb jasny/ciemny** (`ThemeContext`, bez FOUC).
- **Powiadomienia i dostępność** (v0.50): toasty na dole ekranu (bliżej kciuka,
  nad dolnym paskiem) z `aria-live`; modale potwierdzeń dostępne (`role="dialog"`,
  `aria-modal`, autofocus, `Escape` = anuluj, pułapka `Tab`, powrót fokusu);
  spójny pusty stan (`EmptyState`) na Start i Raportach; większe cele dotykowe
  (chipy filtrów, ✕ wyszukiwarki); dark-warianty chipów priorytetu/istotności.
- **Menu ⋯ na kartach listy** (v0.50) — rzadsze/destrukcyjne akcje (Duplikuj,
  Usuń) schowane w rozwijanym menu; „Otwórz" i „📄 PDF" zostają widoczne, więc
  czerwony „Usuń" nie sąsiaduje bezpośrednio z „Otwórz".
- **Start** (`#/`, przebudowany w v0.51) — pulpit „co teraz zrobić", ułożony wg
  **częstotliwości użycia**: powitanie → (ewentualne ostrzeżenia o pamięci/backupie)
  → **„+ Nowy raport" + 3 skróty do najczęstszych typów** (omijają ekran wyboru
  typu; kolejność wynika z Twojej historii, dopełniana strefą „dla klienta")
  → **„⏱ Wróć do pracy"** = 3 ostatnio edytowane raporty (wcześniej tylko 1)
  → link do pełnej listy → **metryki miesiąca jako jeden cichy wiersz na dole**
  (informacja, nie akcja — wcześniej trzy karty nad głównym przyciskiem).
- **Raporty** (`#/reports`, uporządkowane w v0.51) — **lista jest widoczna od
  razu**, nad nią tylko trzy wiersze: nagłówek (`+ Nowy` + menu ⋯), wyszukiwarka
  (debounced, przeszukuje też rekordy `NotesList`) oraz segment
  `Wszystkie | 🏢 Dla klienta | 🔒 Wewnętrzne` z przyciskiem **„Filtry (N)"**.
  - **Filtry zwinięte** — chipy typów, statusu i podfiltry rejestru lekcji
    rozwijają się na żądanie; licznik `(N)` na przycisku zostaje po zwinięciu,
    więc nic nie filtruje „w ukryciu". Obok licznik wyników i „Wyczyść".
  - **Narzędzia archiwum w menu ⋯** (rzeczy używane raz w miesiącu, wcześniej
    zajmowały stałe wiersze nad listą): „☑ Zaznacz wiele", „📥 Importuj raport
    z paczki", „💾 Backup wszystkich raportów" oraz — gdy istnieją lekcje —
    „📊 Rejestr lekcji → Excel" (patrz §7).
  - Lista ma stałą kolejność (wg `createdAt`), akcent strefy na lewej krawędzi
    karty, „Otwórz" + „📄 PDF" widoczne, a Duplikuj/Usuń w menu ⋯ karty.
    Multi-select ma pasek akcji zbiorczych nad TabBarem.
- **Onboarding** (jednorazowy tour) + **stała strona Pomocy** (`#/help`, z sekcją
  „Wysyłka do Teams — znane problemy").
- **Ustawienia globalne** (`#/settings`) — domyślny autor + rola, konfigurowalne
  powody zatrzymań, **kategorie błędu (lekcja projektowa)**, podfolder SharePoint,
  e-mail zakupowca, wskaźnik pamięci.

---

## 9. PWA / offline / aktualizacje

- Tryb **`prompt`** — nowa wersja czeka w „waiting", baner `UpdatePrompt`
  proponuje „Odśwież" (skipWaiting + reload). Kliknięcie `VersionBadge` ręcznie
  sprawdza aktualizacje (v0.43: czeka aż nowy SW się zainstaluje, nie sztywne
  1,2 s) i — gdy nic nie znajdzie — proponuje **„Wymuś odświeżenie"**
  (`forceUpdate`: czyści cache Workboxa + reload) dla upartej PWA na iOS.
  `updateNow` ma zapasowy reload po 2,5 s (iOS bywa głuchy na `controllerchange`).
- **Precache** (Workbox): kod + font Roboto (świadomie, do generowania PDF
  offline). **Wykluczone z precache**: martwe opcjonalne zależności jsPDF
  (`index.es`, `purify.es`, `html2canvas`), **pdf.js + worker** (~1,3 MB) oraz
  **SheetJS `xlsx`** (~430 KB) — ładowane online dopiero przy 1. użyciu (podgląd
  PDF / eksport rejestru XLSX). Nazwane chunki (`pdfjs`, `xlsx`) w `manualChunks`.
- Instalacja PWA z ekranu głównego (`InstallPrompt`). Na Androidzie/desktopie
  przycisk „Zainstaluj" (`beforeinstallprompt`); na **iOS** (gdzie Safari tego
  zdarzenia nie odpala) — instrukcja „Udostępnij → Do ekranu początkowego"
  (v0.50), inaczej użytkownicy iPhone nie widzieli żadnej podpowiedzi.

---

## 10. Struktura plików (`src/`)

```
App.jsx                     # szkielet, routing, providery, VersionBadge, TabBar
main.jsx                    # punkt wejścia
pages/
  Start.jsx                 # pulpit: powitanie, statystyki, + Nowy, „kontynuuj ostatni"
  Reports.jsx               # zakładka 🗂: pełna lista, segment stref, filtry, multi-select, import/backup/rejestr
  NewReport.jsx             # wybór typu raportu (dwie kolorowe strefy)
  Help.jsx                  # pomoc
  Settings.jsx              # ustawienia globalne
components/
  reports/                  # 6 komponentów: Commissioning/Service/Prototype/SatFat/Complaint/Lesson
  common/                   # Header, MediaUploader, PhotoAnnotator, VoiceMic, AutoSaveIndicator,
                            # ReportActionBar (+LockBanner), LoadingOverlay, PdfPreview, ErrorBoundary,
                            # Toast, SWManager, ThemeContext, InstallPrompt, UpdatePrompt, TabBar,
                            # OnboardingTour, SortableList, ToggleGroup, SuggestInput, NotesList,
                            # PackageImportDialog, SectionNav, EmptyState, StorageAlerts
utils/
  storage.js                # raporty (localStorage per-klucz + cache + migracje)
  imageStore.js             # media w IndexedDB
  settings.js               # ustawienia
  useReportPage.js          # wspólny hook strony raportu (download/share/preview)
  useAutoSave.js            # debounced autosave
  useWakeLock.js            # Screen Wake Lock (ekran nie gaśnie w sesji uruchomienia)
  validateReport.js         # walidacja przed eksportem + buildChecks (total/filled do wskaźnika)
  syncPackage.js            # paczki .suresync + helpery Web Share + canShareFiles
  pdfGenerator.js           # barrel API generowania
  pdf/
    core.js                 # silnik PDF + prymitywy + buildReportPdf + makeReportGenerators
    service.js commissioning.js prototype.js satfat.js complaint.js lesson.js
    fonts/roboto-regular.js roboto-bold.js   # font base64 (lazy)
  registerExport.js         # eksport rejestru lekcji → XLSX (SheetJS, lazy)
  analyticsExport.js        # eksport analityczny: gwiazda → XLSX wielozakładkowy + JSONL
  reportMeta.js             # typy + strefy + słowniki klucz→etykieta (labels/ikony/akcenty)
  reportFields.js           # pola przekrojowe: reportClient/Location/TimeRange/Minutes
  reportNumber.js           # wspólny computeReportNumber(prefix,projekt,data,prev)
  time.js                   # nowHHMM + minutesBetween + durationLabel (jedno źródło)
  version.js                # APP_VERSION — jedno źródło numeru wersji
  text.js                   # slugify + formatBytes (współdzielone, bezzależnościowe)
  suggestions.js            # źródła autouzupełniania
  imageCompressor.js        # kompresja zdjęć
assets/logo.png
```

---

## 11. Build, testy, deploy

- **Dev:** `npm run dev` (Vite, port 5173). **Build:** `npm run build`.
  **Testy E2E:** `npm run test:e2e` (Playwright).
- **Smoke testy** (`tests/smoke.spec.js`, 6 testów): ładowanie Home; serwisowy
  PDF z natywnym tekstem + polskie znaki; osobny PDF vs ZIP + załącznik dużych
  zdjęć; **lekcja projektowa: karta PDF + eksport rejestru XLSX**; **eksport
  analityczny: zakładki XLSX + JSONL z wyliczonymi miarami** (dostępność, MTBF,
  MTTR, sumy sztuk, kilometry jako liczba, migracja klienta v3→v4, „puste ≠ 0");
  podgląd PDF w apce
  renderuje strony. `beforeEach` wyłącza Web Share, by deterministycznie
  pojawiały się przyciski „Pobierz".
- **UWAGA przy uruchamianiu testów:** `npm run build && npm run test:e2e | tail`
  zwraca kod wyjścia z `tail`, NIE z Playwrighta — „exit 0" potrafi zamaskować
  padnięty test. Czytaj wiersz „N passed/failed" albo sprawdź `$LASTEXITCODE` /
  `PIPESTATUS` po samym Playwrightcie.
- **CI/CD:** GitHub Actions buduje, instaluje Chromium, uruchamia smoke testy i
  publikuje na GitHub Pages (deploy bramkowany testami).

---

## 12. Wersjonowanie

**Reguła:** każda zmiana kodu trafiająca do użytkownika MUSI podbić numer wersji
w **`src/utils/version.js`** (`APP_VERSION`, od v0.52 — przedtem stała siedziała
w `src/App.jsx`) **oraz** w `package.json`. Numer pokazuje `VersionBadge` w
nagłówku; służy użytkownikowi do potwierdzenia, że PWA pobrała aktualizację, a
eksport analityczny stempluje nim pliki.

**Aktualna wersja: v0.53.** Skrót ostatnich zmian:
- **v0.53** — **kilometry dojazdu w raporcie serwisowym** (`visit.travelKm`):
  pole liczbowe (nie suwak — wartość rozliczeniowa musi być dokładna co do
  kilometra), a wygodę robią chipy z historii per klient (`suggestTravelKm`).
  Echo obok czasu wizyty, czwarta
  komórka w wierszu godzin w PDF, kolumna `Dojazd [km]` w eksporcie
  analitycznym, zachowywane przy duplikowaniu wizyty. Bez migracji — pole
  opcjonalne, poza bramką kompletności. Szczegóły w §5.
- **v0.52** — **wykorzystanie danych z raportów**: (1) **eksport analityczny**
  (`analyticsExport.js`) — cała baza jako gwiazda: tabela faktów + 8 tabel-dzieci,
  XLSX wielozakładkowy z autofiltrem i zakładką `Info` oraz JSONL dla Power BI;
  wyliczane miary (dostępność, MTBF, MTTR, FPY, sumy sztuk, liczniki zdjęć);
  wejście z menu ⋯ → sekcja „Analiza"; (2) **domknięcie luk w danych**, bez
  których analiza była niemożliwa: `supplier` w reklamacji (Pareto dostawców),
  `parts[].qty` w serwisie (sztuki, nie wystąpienia), **klient/lokalizacja w
  `header` dla wszystkich typów** (migracja `SCHEMA_VERSION` 3→4 + `reportFields.js`),
  godziny odbioru w SAT/FAT i testu w prototypie; (3) dedup arytmetyki czasu do
  `utils/time.js` (były trzy kopie) i numeru wersji do `utils/version.js`;
  (4) słowniki klucz→etykieta w `reportMeta.js`. Nowy smoke test pilnuje wyliczeń.
- **v0.51** — **uporządkowanie ekranu głównego i listy** (aplikacja rosła przez
  dodawanie — każda nowa funkcja dostawała stały wiersz nad treścią). Zasada:
  **miejsce = częstotliwość użycia**. Start: „+ Nowy raport" i 3 skróty typów na
  górze, „Wróć do pracy" = 3 ostatnie raporty, metryki miesiąca zdegradowane do
  jednego wiersza na dole. Raporty: lista widoczna od razu (z 8–11 wierszy chromu
  zostały 3), filtry zwinięte za „Filtry (N)", a import/backup/rejestr/zaznaczanie
  przeniesione do menu ⋯ w nagłówku. Nowe: `TYPE_SHORT` w `reportMeta.js`.
- **v0.50** — pakiet **UX/UI polish**. Menu ⋯ na kartach listy (Duplikuj/Usuń
  schowane — bezpieczniejszy „Usuń"). Modale dostępne (role=dialog, aria-modal,
  autofocus, Escape, pułapka Tab). Toasty przeniesione na dół (bliżej kciuka) +
  `aria-live`. Ujednolicony pusty stan (`EmptyState`) na Start i Raportach.
  Dark-warianty chipów priorytetu/istotności (serwis, lekcja). Większe cele
  dotykowe (chipy filtrów, ✕ wyszukiwarki) + etykieta wyszukiwarki. Instrukcja
  „Dodaj do ekranu głównego" na iOS (Safari nie ma zwykłej instalacji).
- **v0.49** — pakiet **teren / mniej pisania (część 2)**. Dyktowanie
  (`MicInput`) w opisowych polach jednoliniowych: kryterium akceptacji SAT/FAT,
  komentarz punktu prototypu, komentarz części serwisu. Ręczne dodanie
  zatrzymania w raporcie uruchomienia („+ Dodaj zatrzymanie ręcznie") — gdy
  inżynier zapomni kliknąć na żywo; tworzy rekord i otwiera modal korekty
  czasu/powodu.
- **v0.48** — pakiet **teren / mniej pisania (część 1)**. Live wskaźnik
  kompletności w pasku sekcji: pasek postępu + „Brakuje N · X/Y" (lub
  „✓ Kompletny"), tapnięcie skacze do pierwszego braku — z tego samego źródła
  co walidacja przy pobieraniu. Wake Lock w sesji uruchomienia — ekran nie
  gaśnie podczas obserwacji z live-timerem.
- **v0.47** — pakiet **bezpieczeństwa danych**. Autosave przy pełnej pamięci
  już nie „udaje sukcesu" — pojawia się czerwony baner „Pamięć pełna" z
  przyciskiem backupu (wcześniej zmiany ginęły po reloadzie). Pulpit
  przypomina o backupie (≥3 raporty i brak kopii / >14 dni) i ostrzega przy
  >85% zapełnienia. Osierocone zdjęcia w IndexedDB są sprzątane przy starcie
  (usunięcie zdjęcia z raportu kasowało dotąd tylko wpis, nie plik). Nazwa
  backupu zawiera godzinę (koniec kolizji kilku kopii tego samego dnia).
- **v0.46** — **nie-destrukcyjna re-edycja adnotacji**. Po wyjściu z edytora
  można wrócić i poprawić/usunąć naniesione uwagi. Zamiast nadpisywać oryginał
  spłaszczonym obrazem, apka trzyma trzy artefakty: `originalId` (spłaszczony —
  do ZIP/PDF), `editBaseId` (czysta baza) i `shapes` (wektorowe adnotacje).
  Ponowne otwarcie wczytuje czystą bazę i przywraca edytowalne kształty. Naprawia
  też rysowanie poza obrazem (w ciemnym pasie) — punkty są klamrowane do kadru,
  więc adnotacje nie znikają z eksportu. Uwaga: zdjęcia zaadnotowane przed v0.46
  mają uwagi wtopione na stałe (nowe są w pełni edytowalne).
- **v0.45** — **nowy edytor zdjęć** (pełny rewrite `PhotoAnnotator`). Kształty
  w współrzędnych obrazu + transformacja widoku → **zoom (szczypanie / kółko /
  narzędzie 🖐) i przesuwanie** dla precyzyjnych adnotacji na zdjęciach z
  telefonu; **undo/redo** całej historii (`useReducer`) zamiast zepsutego
  „Cofnij"; **tekst w miejscu** (nakładka `textarea`) zamiast `window.prompt`;
  **kadrowanie** i **obrót 90°** (transformują też adnotacje); **jakość** —
  PNG zapisywany bezstratnie, JPEG 0.92, brak degradacji przy wielokrotnej
  edycji; Toast/Confirm zamiast `alert/confirm/prompt`.
- **v0.44** — **refaktoryzacja i optymalizacja** (audyt 3 obszarów; netto −194
  linie). Martwy kod: usunięty łańcuch `buildLinkMaps/photoMap/target` (core +
  6 modułów PDF), nieużywane eksporty (`collectPhotoIds`, `getImage/getVideo`,
  `suggestActionDescriptions`, `fmtSize`), devDep `ffmpeg-static`. Dedup do
  jednego źródła: `utils/reportNumber.js` (`computeReportNumber`), `utils/text.js`
  (`slugify` + `formatBytes`), `ROLE_OPTIONS`/`TYPE_ICONS`/etykiety z
  settings|reportMeta. Bugi: `useAutoSave` nie bumpuje `updatedAt` przy samym
  otwarciu (dirtyRef), guardy uczestników SAT/FAT, `imageStore.openDb`
  onblocked/onversionchange, `PackageImportDialog` `Wrap` poza renderem +
  etykiety lesson/complaint, ochrona ręcznego numeru w serwisie/lekcji. Perf/a11y:
  useMemo liczników (prototyp/SAT-FAT), `aria-pressed`/`role=status`.
- **v0.43** — **fix niezawodnej aktualizacji PWA na telefonie**: `checkForUpdate`
  czeka aż nowy SW faktycznie się zainstaluje (nasłuch `statechange`, do 15 s)
  zamiast sztywnych 1,2 s (na wolnym mobile dawało fałszywe „aktualna");
  `forceUpdate()` — „Wymuś odświeżenie" czyści cache i przeładowuje (ratunek dla
  upartej PWA na iOS; dane w IndexedDB nietknięte); `VersionBadge` proponuje je,
  gdy check nic nie znajdzie; zapasowy reload w `updateNow`.
- **v0.42** — **nowy interfejs** (hybryda „tab bar + strefy"): dolny pasek
  nawigacji `Start / 🗂 Raporty / Pomoc` (`TabBar`, safe-area, ukryty w
  formularzach); **strefy typów** — 🏢 Dla klienta (niebieski: serwis, SAT/FAT,
  uruchomienie) i 🔒 Wewnętrzne (fiolet: prototyp, lekcja, reklamacja) w
  `reportMeta.js`; **Start** = lekki pulpit (powitanie, statystyki, „+ Nowy",
  „ostatnio edytowany"); **Raporty** = pełna lista z segmentem stref,
  kolorowanymi chipami i akcentem na kartach; wybór typu w dwóch strefach;
  `Home.jsx` → `Start.jsx` + `Reports.jsx`.
- **v0.41** — rejestr lekcji **w aplikacji**: przy filtrze „🎓 Lekcja" kontekstowy
  wiersz podfiltrów (kategoria z danych + istotność) — przeglądasz rejestr bez
  Excela; w multi-select przycisk „📊 Rejestr" eksportuje XLSX **tylko z
  zaznaczonych** lekcji. `clearAllFilters()`, `handleExportRegister(subset)`.
- **v0.40** — nowy, 6. typ raportu **„Lekcja projektowa"** (feedback błędów do
  konstrukcji / Lessons Learned): kontekst, opis błędu + zdjęcia, kategoria
  (konfigurowalna) + istotność, skutek, wnioski (`NotesList`); auto-numer `LL-`;
  karta PDF. **Eksport rejestru wszystkich lekcji do XLSX** (SheetJS, leniwie,
  poza precache) — filtrowalna „baza" bez backendu. Kategorie edytowalne w
  Ustawieniach. 5. smoke test (karta PDF + XLSX). Świadoma decyzja: bez integracji
  SharePoint na teraz (`registerExport.js`, `pdf/lesson.js`, `LessonReport.jsx`).
- **v0.39** — pakiet UX: chipy autouzupełniania (`SuggestInput` przepisany na
  tapowalne podpowiedzi z historii), domyślny autor + rola w Ustawieniach
  (prefill), „⏱ Teraz" przy godzinach serwisu, **auto-numer dla wszystkich typów**
  (`PRT-`, `FAT-`/`SAT-`), konfigurowalne powody zatrzymań, „✉️ Wyślij mailem"
  (desktop), karta na Home → „📄 PDF", koniec podwójnej daty w nazwie pliku
  (`fileBase`), sekcja Teams/OneDrive w Pomocy, mikrofon w prototypie, SAT/FAT
  „Wnioski" → `NotesList` (schemat 2→3), poprawka walidacji („Numer projektu").
- **v0.38** — rekomendacje serwisu oraz obserwacje/wnioski uruchomienia jako
  **powtarzalne rekordy** (przycisk „+ Dodaj", jak obserwacje serwisu); wspólny
  komponent `NotesList`; `SCHEMA_VERSION` 1→2 (migracja pól-stringów na listy).
- **v0.37** — numer raportu uruchomienia auto (`URU-`) jak w serwisie; „💾 Zapisz
  PDF na urządzenie" w każdym raporcie; **usunięte hiperłącza ze zdjęć** w PDF
  (zostaje link nazwy wideo); liczba osób obecnych na serwisie (`visit.attendees`).
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
- **Podgląd offline / eksport XLSX offline** — pdf.js oraz SheetJS (`xlsx`)
  ładują się online przy pierwszym użyciu (świadomie poza precache). Offline
  podgląd/eksport rejestru pokaże błąd; sama praca nad raportami działa offline.
- **Duże raporty** — wiele zdjęć w załączniku zwiększa rozmiar PDF (kompromis:
  samowystarczalny plik vs waga).
- **Dane lokalne** — wyczyszczenie danych przeglądarki = utrata raportów.
  Do przenoszenia/backupu służy paczka `.suresync`. iOS Safari potrafi czyścić
  IndexedDB po ~7 dniach nieużywania, chyba że PWA jest dodana do ekranu głównego.
- **Voice-to-text** wysyła audio do serwera przeglądarki (Google/Apple/MS);
  Firefox nie wspiera Web Speech API (graceful fallback).
- **Jakość analityki zależy od słowników, nie od formatu eksportu.** Klient,
  maszyna, nazwa części i parametry prototypu to nadal **wolny tekst** z
  podpowiedziami z historii — „BSH", „BSH Rzeszów" i „bsh" policzą się jako trzy
  różne wartości. Eksport przycina spacje, ale nie scala wariantów. Wnioski:
  (1) korzystaj z podpowiedzi zamiast wpisywać od nowa, (2) na wskaźnikach
  słownikowych (powody zatrzymań, kategorie lekcji, kategorie wad) można polegać,
  bo pochodzą z list w Ustawieniach, (3) na polach opisowych — nie.
- **Reklamacja nie ma klienta** (ma dostawcę) — w analizie „per klient" wypada;
  spina się z projektem przez `Nr projektu`.
- **Korelacja parametr↔NOK w prototypie** wymaga spójnych nazw parametrów;
  `params[].key` jest wolnym tekstem, więc „prędkość" i „predkosc" nie połączą się.

---

## 14. Kierunki rozwoju (opcjonalne)

- **Integracja z SharePointem** — apka po zakończeniu raportu wrzucałaby PDF/ZIP
  na firmowy SharePoint (MS Graph). Wymaga rejestracji w Entra ID — instrukcje w
  `INSTRUKCJA-ENTRA.md`, plan w `PLAN-SHAREPOINT.md`. Najmniej inwazyjny backend
  (używa istniejącego M365, dane nie wypływają na zewnątrz).
- **Analiza danych — wątek ZAMKNIĘTY na Fazie A+B (v0.52).** Plan miał cztery
  fazy; wdrożone zostały dwie pierwsze (eksport + domknięcie pól), a kolejne
  **odłożone decyzją użytkownika (2026-07-29: „na razie kończymy z opcją
  analizy")**. Nie są porzucone — czekają na sygnał z realnego użycia eksportu:
  - **Faza C — pulpit „Analiza" w apce**: 4–5 kafli liczonych lokalnie
    (dostępność uruchomień, Pareto zatrzymań, godziny per klient, macierz lekcji
    kategoria × etap). Uzasadnienie: eksport do Excela to friction — w terenie
    nikt go nie zrobi. Dane są już policzone w `analyticsExport.js`, więc pulpit
    to głównie warstwa prezentacji.
  - **Faza D — Power BI nad folderem w OneDrive/SharePoint**: kolejne pliki
    `analiza-raportow_*.xlsx`/`.jsonl` układają się w szereg czasowy (nazwa z
    datą i godziną, nic się nie nadpisuje); Power BI ma konektor „Folder". To
    plik w chmurze, nie backend, więc nie łamie architektury klient-only.
  - **Słowniki zamiast wolnego tekstu** dla klienta, maszyny i parametrów
    prototypu (patrz §13) — warunek, żeby liczby z pól opisowych były
    wiarygodne. Najtańszy krok, gdyby pierwszy eksport pokazał rozjechane
    warianty nazw.
  Naturalny moment powrotu: po pierwszym eksporcie na realnych danych — wtedy
  wiadomo, których przekrojów faktycznie brakuje (i czy nie trzeba raczej
  poprawić kolumn niż budować pulpit).
- **Subset fontu Roboto** (~168→60 KB) — mikrooptymalizacja precache.
- **Przełącznik „dołączaj duże zdjęcia do PDF"** / limit rozdzielczości
  załącznika — gdyby waga PDF była problemem.
- **Wyjście z architektury** (mały backend / sync) — tylko po wyraźnej decyzji,
  gdy obecny model klient-only realnie zacznie blokować pracę zespołu.
