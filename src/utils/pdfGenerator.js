// Publiczne API generowania PDF/paczek — barrel.
// Implementacja podzielona na moduły w ./pdf/:
//   core.js          — wspólna infrastruktura (render HTML→PDF z łamaniem stron,
//                      resolver zdjęć medium-res, składanie paczki ZIP, helpery)
//   commissioning.js — raport uruchomienia / obserwacji maszyny
//   service.js       — raport serwisu na obiekcie (wzorzec podejścia do zdjęć)
//   prototype.js     — raport testów prototypu
//   satfat.js        — raport odbioru SAT / FAT
//   complaint.js     — zgłoszenie wady / reklamacja
// Importerzy (strony raportów, Home, App-warmup) używają wyłącznie tego pliku.
export { warmupLibs } from './pdf/core.js'
export { generateCommissioningPackage, generateCommissioningPdf } from './pdf/commissioning.js'
export { generateServicePackage, generateServicePdf } from './pdf/service.js'
export { generatePrototypePackage, generatePrototypePdf } from './pdf/prototype.js'
export { generateSatFatPackage, generateSatFatPdf } from './pdf/satfat.js'
export { generateComplaintPackage, generateComplaintPdf, generateComplaintZip } from './pdf/complaint.js'
