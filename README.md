# SureSolutions — Report App

Aplikacja webowa (PWA) do tworzenia raportów z testów, serwisów i uruchomień maszyn.

## Status: Faza 1

Zaimplementowano:
- Ekran startowy + lista zapisanych raportów (localStorage)
- Wybór typu raportu (aktywny tylko Typ 3)
- **Raport uruchomienia / obserwacji maszyny (Typ 3)**:
  - Faza 1: nagłówek + przycisk START MASZYNY
  - Faza 2: timer na żywo + log zatrzymań z modalem (powód, komentarz)
  - Faza 3: podsumowanie statystyk + obserwacje + wnioski
- Eksport do PDF (jsPDF + html2canvas) z logo firmowym
- Auto-save do localStorage

Kolejne fazy: Typ 2 (serwis), Typ 1 (testy prototypu), PWA offline, IndexedDB + zdjęcia.

## Uruchomienie

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # produkcja → dist/
npm run preview  # podgląd builda
```
