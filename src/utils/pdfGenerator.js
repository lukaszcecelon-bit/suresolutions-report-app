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
export { generateCommissioningPackage } from './pdf/commissioning.js'
export { generateServicePackage } from './pdf/service.js'
export { generatePrototypePackage } from './pdf/prototype.js'
export { generateSatFatPackage } from './pdf/satfat.js'
export { generateComplaintPackage, generateComplaintZip } from './pdf/complaint.js'
