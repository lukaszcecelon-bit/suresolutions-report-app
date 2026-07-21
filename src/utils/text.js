// Drobne, bezzależnościowe helpery tekstowe współdzielone przez warstwę danych
// i generowanie PDF. Świadomie OSOBNY plik (nie w pdf/core.js) — core.js
// importuje logo.png, więc import stamtąd wciągnąłby ciężki moduł do chunku
// syncPackage. Tu trzymamy tylko czysty tekst.

// Transliteracja PL + oczyszczenie do bezpiecznej nazwy pliku (ZIP/PDF).
// Jedna, kanoniczna wersja — wcześniej istniały dwie rozjeżdżające się kopie
// (pdf/core.js i syncPackage.js), co groziło różnymi nazwami tego samego pliku
// w paczce ZIP i w PDF.
export function slugify(s) {
  return (s || '')
    .replace(/[ąĄ]/g, 'a').replace(/[ćĆ]/g, 'c').replace(/[ęĘ]/g, 'e')
    .replace(/[łŁ]/g, 'l').replace(/[ńŃ]/g, 'n').replace(/[óÓ]/g, 'o')
    .replace(/[śŚ]/g, 's').replace(/[źŹżŻ]/g, 'z')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80)
}

// Ludzki rozmiar w bajtach. Jedna wersja zamiast trzech (MediaUploader,
// PackageImportDialog, Settings miały własne, lekko różne implementacje).
export function formatBytes(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
