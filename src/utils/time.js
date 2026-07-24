// Godziny HH:MM i czasy trwania — jedno źródło wyliczeń. Przedtem ta sama
// arytmetyka żyła w trzech kopiach (ServiceReport.visitDurationLabel,
// pdf/service.serviceVisitDuration, Start.visitMinutes), więc „łączny czas
// wizyty" mógł się rozjechać między formularzem, PDF-em i pulpitem. Teraz
// dokłada się do tego eksport analityczny, który MUSI liczyć tak samo.

export function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Różnica dwóch godzin HH:MM w minutach. Przejście przez północ traktujemy jako
// następny dzień (serwis potrafi skończyć po 24:00). null = brak danych.
export function minutesBetween(from, to) {
  if (!from || !to) return null
  const [ah, am] = String(from).split(':').map(Number)
  const [bh, bm] = String(to).split(':').map(Number)
  if ([ah, am, bh, bm].some((n) => !Number.isFinite(n))) return null
  let mins = (bh * 60 + bm) - (ah * 60 + am)
  if (mins < 0) mins += 24 * 60
  return mins
}

// „2 h 15 min" / „45 min". Zero i brak danych → null, żeby UI nie pokazywało
// mylącego „0 min" dla nieuzupełnionych godzin.
export function durationLabel(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function durationBetweenLabel(from, to) {
  return durationLabel(minutesBetween(from, to))
}
