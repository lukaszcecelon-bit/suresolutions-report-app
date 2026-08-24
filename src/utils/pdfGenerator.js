// Publiczne API generowania PDF/paczek — barrel.
// Implementacja podzielona na moduły w ./pdf/:
//   core.js          — wspólna infrastruktura (render HTML→PDF z łamaniem stron,
//                      resolver zdjęć medium-res, składanie paczki ZIP, helpery)
//   commissioning.js — raport uruchomienia / obserwacji maszyny
//   service.js       — raport serwisu na obiekcie (wzorzec podejścia do zdjęć)
//   prototype.js     — raport testów prototypu
//   satfat.js        — raport odbioru SAT / FAT
//   complaint.js     — zgłoszenie wady / reklamacja
//   lesson.js        — ticket z montażu (Lesson Learned)
// Importerzy (strony raportów, Home, App-warmup) używają wyłącznie tego pliku.
// Buildery zwracają { blob, filename } (bez pobierania). useReportPage decyduje:
// pobrać (downloadBlob) czy udostępnić (Web Share → Teams/Mail).
export { warmupLibs } from './pdf/core.js'
export { buildCommissioningPackage, buildCommissioningPdf } from './pdf/commissioning.js'
export { buildServicePackage, buildServicePdf } from './pdf/service.js'
export { buildPrototypePackage, buildPrototypePdf } from './pdf/prototype.js'
export { buildSatFatPackage, buildSatFatPdf } from './pdf/satfat.js'
export { buildComplaintPackage, buildComplaintPdf } from './pdf/complaint.js'
export { buildLessonPackage, buildLessonPdf } from './pdf/lesson.js'
