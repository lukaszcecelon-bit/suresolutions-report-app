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
export { buildCommissioningPackage, buildCommissioningPdf, buildCommissioningTransfer } from './pdf/commissioning.js'
export { buildServicePackage, buildServicePdf, buildServiceTransfer } from './pdf/service.js'
export { buildPrototypePackage, buildPrototypePdf, buildPrototypeTransfer } from './pdf/prototype.js'
export { buildSatFatPackage, buildSatFatPdf, buildSatFatTransfer } from './pdf/satfat.js'
export { buildComplaintPackage, buildComplaintPdf, buildComplaintTransfer } from './pdf/complaint.js'
export { buildLessonPackage, buildLessonPdf, buildLessonTransfer } from './pdf/lesson.js'

import { buildCommissioningTransfer } from './pdf/commissioning.js'
import { buildServiceTransfer } from './pdf/service.js'
import { buildPrototypeTransfer } from './pdf/prototype.js'
import { buildSatFatTransfer } from './pdf/satfat.js'
import { buildComplaintTransfer } from './pdf/complaint.js'
import { buildLessonTransfer } from './pdf/lesson.js'

// Rejestr builderów „PDF do przeniesienia" per typ raportu — dzięki niemu
// useReportPage sięga po właściwy bez przekazywania go przez każdą z 6 stron.
export const TRANSFER_BUILDERS = {
  commissioning: buildCommissioningTransfer,
  service: buildServiceTransfer,
  prototype: buildPrototypeTransfer,
  satfat: buildSatFatTransfer,
  complaint: buildComplaintTransfer,
  lesson: buildLessonTransfer,
}
