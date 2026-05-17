# Deploy na GitHub Pages

## Status: lokalnie gotowe, brakuje konta GitHub

Repo zainicjalizowane, pierwszy commit zrobiony, workflow Actions czeka na push.

## Co zrobi Ty (5 minut)

1. **Załóż konto na https://github.com/signup**
   - Podaj username, email firmowy, hasło
   - Potwierdź email

2. **Wróć i daj znać że masz konto** — podaj username

   Ja dokończę resztę:
   - `gh auth login` (otworzy przeglądarkę, zalogujesz się)
   - `gh repo create suresolutions-report-app --public --source . --push`
   - Włączenie Pages → Source: GitHub Actions
   - Pierwsze uruchomienie workflow

## Po deployu — adres aplikacji

```
https://USERNAME.github.io/suresolutions-report-app/
```

PWA (instalacja na telefonie) zadziała po wejściu na ten URL z telefonu —
otwórz w Chrome/Safari, użyj „Dodaj do ekranu głównego".

## Update aplikacji (po każdej zmianie)

```bash
git add .
git commit -m "opis zmian"
git push
```

Workflow Actions zbuduje i wdroży automatycznie (~2 min). Zainstalowane PWA
na telefonie wykryje nową wersję i pokaże baner „Nowa wersja aplikacji →
Odśwież".

## Alternatywa: deploy ręczny bez Actions

Jeśli kiedyś chciałbyś deploy bez GitHub Actions:

```bash
npm install -D gh-pages
npm run build
npx gh-pages -d dist
```

(wymaga gałęzi `gh-pages` jako źródła Pages — przeciwieństwo bieżącej
konfiguracji opartej o Actions)
