# Materiały marketingowe — SureSolutions Report App

Zestaw gotowych do publikacji screenshotów i screencastów aplikacji.
Wszystko wygenerowane automatycznie przez Playwright na żywej wersji
aplikacji (`https://lukaszcecelon-bit.github.io/suresolutions-report-app/`)
po wstrzyknięciu zestawu demo-raportów (3 raporty + 6 zdjęć w stylu industrialnym).

## Wybór do LinkedIn — szybka ściągawka

| Cel | Plik |
|---|---|
| Hero / cover post | `desktop/01-home.png` (czyste, pokazuje 3 raporty + wyszukiwarka) |
| „Live timer w akcji" | `desktop/04-commissioning-summary-top.png` (kafelki statystyk = bardzo czytelne na feedzie) |
| Wnętrze raportu serwisowego | `desktop/05-service-report-full.png` (pełny pdf-podobny widok) |
| Wizualizacja mobile (PWA) | `mobile/03-commissioning-summary.png` lub `mobile/05-commissioning-photos.png` |
| Screencast główny do LinkedIn | `videos/02-commissioning-mobile.mp4` (mobile, dynamic, ~10 sek) |
| Drugi screencast (desktop) | `videos/01-service-walkthrough.mp4` |

## Desktop screenshoty (1280×800 @2x, retina)

| # | Plik | Co pokazuje |
|---|---|---|
| 01 | `desktop/01-home.png` | Strona główna — lista 3 raportów, wyszukiwarka, chipy filtra typu/statusu, przyciski akcji |
| 02 | `desktop/02-new-report-picker.png` | Wybór typu raportu (3 duże kafelki) |
| 03 | `desktop/03-commissioning-finished-full.png` | Pełny widok raportu uruchomienia (Faza 3) — fullPage scroll |
| 04 | `desktop/04-commissioning-summary-top.png` | Tylko top — 4 statystyki + nagłówek (najlepsze do hero) |
| 05 | `desktop/05-service-report-full.png` | Pełny raport serwisowy z czynnościami, parts, podsumowaniem |
| 06 | `desktop/06-service-report-top.png` | Top raportu serwisowego (nagłówek + dane wizyty) |

## Mobile screenshoty (iPhone 14, 390×844)

| # | Plik | Co pokazuje |
|---|---|---|
| 01 | `mobile/01-home.png` | Strona główna (mobile view) |
| 02 | `mobile/02-new-report-picker.png` | Wybór typu raportu |
| 03 | `mobile/03-commissioning-summary.png` | Top raportu uruchomienia + statystyki |
| 04 | `mobile/04-commissioning-stops-log.png` | Tabela log zatrzymań |
| 05 | `mobile/05-commissioning-photos.png` | Siatka zdjęć z badge "Zdj. NN" |
| 06 | `mobile/06-service-top.png` | Top raportu serwisowego (dane wizyty) |
| 07 | `mobile/07-prototype-top.png` | Top raportu prototypu — nagłówek + Test #3 + metoda |
| 08 | `mobile/08-prototype-results.png` | Sekcja C — wyniki testu (statystyki OK/NOK/Warunkowo) |

## Wideo (MP4 + WebM)

| Plik | Format | Co pokazuje | Czas |
|---|---|---|---|
| `videos/01-service-walkthrough.mp4` | 1280×800 MP4 H.264 | Desktop: otwarcie raportu serwisowego + scroll przez wszystkie sekcje | ~12s |
| `videos/02-commissioning-mobile.mp4` | 390×844 MP4 H.264 | Mobile: otwarcie raportu uruchomienia + scroll przez statystyki i log zatrzymań | ~14s |
| `videos/*.webm` | WebM VP8 | Wersje oryginalne (mniejsze, ale gorsza kompatybilność) — możesz usunąć jeśli niepotrzebne |

LinkedIn akceptuje MP4 i WebM, **preferuje MP4**.

## Regeneracja

Jeśli zmienisz UI aplikacji i chcesz świeżych screenshotów:

```bash
# 1. Wygeneruj nowe placeholdery (raz, można pominąć jeśli istnieją)
node scripts/marketing/generate-placeholders.mjs

# 2. Uruchom capture — pójdzie do live URL z świeżymi screenami
node scripts/marketing/capture.mjs

# 3. Konwertuj webm → mp4
node scripts/marketing/convert-videos.mjs
```

Skrypty łączą się z **live URL z GitHub Pages** (nie z lokalnym `vite preview`),
więc upewnij się że deploy najnowszej wersji jest gotowy zanim odpalisz capture.

## Uwagi

- **Realnych zdjęć z aparatu nie ma** — wszystkie photo-placeholdery to syntetyczne grafiki SVG z napisem „PRZYKŁAD · SureSolutions" w prawym dolnym rogu. Wystarczy spojrzeć żeby widzieć że to materiały demonstracyjne, nie z prawdziwej wizyty.
- **Voice-to-text nie pokazany w wideo** — Playwright headless nie ma mikrofonu. Jeśli chcesz pokazać dyktowanie, nagraj realny screencast z telefonu (Centrum Sterowania → Nagrywanie ekranu na iOS).
- **Adnotacja palcem w wideo** wygląda jak rysowanie myszką — jeśli to ma się sprzedawać, nagraj 10 sekund palcem na telefonie.
