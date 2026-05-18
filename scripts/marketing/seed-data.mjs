// Builds realistic demo report fixtures with photo references.
// Photos themselves are loaded from disk and converted to base64 dataURLs so
// they can be injected directly into IndexedDB by the Playwright script.
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const IMG_DIR = resolve(__dirname, 'placeholder-images')

async function loadDataUrl(name) {
  const buf = await readFile(resolve(IMG_DIR, name))
  return 'data:image/jpeg;base64,' + buf.toString('base64')
}

function id(prefix) {
  // Deterministic-ish ids — they go through localStorage/IDB so collisions don't matter.
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`
}

export async function buildDemoFixtures() {
  // Load all placeholder photos as dataURLs
  const photos = {
    machineOverview:   await loadDataUrl('photo-machine-overview.jpg'),
    stoppageDetail:    await loadDataUrl('photo-stoppage-detail.jpg'),
    electricalCabinet: await loadDataUrl('photo-electrical-cabinet.jpg'),
    prototypeComp:     await loadDataUrl('photo-prototype-component.jpg'),
    beltReplacement:   await loadDataUrl('photo-belt-replacement.jpg'),
    generalOverview:   await loadDataUrl('photo-general-overview.jpg'),
  }

  // ---- Photo IDs (deterministic-ish) — referenced from reports ----
  const photoIds = {
    p1: id('p'), p2: id('p'), p3: id('p'),
    p4: id('p'), p5: id('p'), p6: id('p'),
  }
  // Originals get separate IDs (we put same bytes for demo simplicity — they're already smallish JPEGs)
  const originalIds = {
    o1: id('o'), o2: id('o'), o3: id('o'),
    o4: id('o'), o5: id('o'), o6: id('o'),
  }

  // ---- IDB seed: image dataURLs + original Blobs (we'll convert in-browser) ----
  const idbSeed = {
    images: [
      { id: photoIds.p1, dataUrl: photos.machineOverview },
      { id: photoIds.p2, dataUrl: photos.stoppageDetail },
      { id: photoIds.p3, dataUrl: photos.electricalCabinet },
      { id: photoIds.p4, dataUrl: photos.prototypeComp },
      { id: photoIds.p5, dataUrl: photos.beltReplacement },
      { id: photoIds.p6, dataUrl: photos.generalOverview },
    ],
    // Same dataURLs for originals in demo (real app would have full-res blobs)
    originals: [
      { id: originalIds.o1, dataUrl: photos.machineOverview },
      { id: originalIds.o2, dataUrl: photos.stoppageDetail },
      { id: originalIds.o3, dataUrl: photos.electricalCabinet },
      { id: originalIds.o4, dataUrl: photos.prototypeComp },
      { id: originalIds.o5, dataUrl: photos.beltReplacement },
      { id: originalIds.o6, dataUrl: photos.generalOverview },
    ],
  }

  const now = new Date().toISOString()
  const today = new Date().toISOString().slice(0, 10)
  const todayMinus = (days) => {
    const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10)
  }

  // ---- REPORTS ----
  const reports = [
    // 1. Commissioning report — finished, with rich data
    {
      id: id('r'),
      type: 'commissioning',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      header: {
        reportNumber: 'RPT-2026-018',
        projectName: '25-104',
        machineName: 'Pakowaczka A-7',
        date: today,
        author: 'Łukasz Cecelon',
      },
      phase: 'finished',
      sessionStartAt: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
      sessionEndAt: new Date(new Date().setHours(14, 32, 0, 0)).toISOString(),
      activeStop: null,
      stops: [
        {
          id: id('s'),
          startAt: new Date(new Date().setHours(9, 17, 0, 0)).toISOString(),
          endAt: new Date(new Date().setHours(9, 20, 12, 0)).toISOString(),
          durationMs: 3 * 60 * 1000 + 12 * 1000,
          reason: 'Zacięcie detalu',
          customReason: '',
          comment: 'Detal zatrzymał się przy stacji 3, prowadnica wymaga korekty.',
          media: [
            { id: id('m'), kind: 'image', photoId: photoIds.p2, originalId: originalIds.o2,
              filename: 'IMG_20260518_091715.jpg', mimeType: 'image/jpeg', size: 124000,
              description: 'Stacja 3 — widok zacięcia' },
          ],
        },
        {
          id: id('s'),
          startAt: new Date(new Date().setHours(11, 4, 0, 0)).toISOString(),
          endAt: new Date(new Date().setHours(11, 5, 45, 0)).toISOString(),
          durationMs: 1 * 60 * 1000 + 45 * 1000,
          reason: 'Regulacja',
          customReason: '',
          comment: 'Korekta położenia prowadnicy bocznej.',
          media: [],
        },
        {
          id: id('s'),
          startAt: new Date(new Date().setHours(13, 28, 0, 0)).toISOString(),
          endAt: new Date(new Date().setHours(13, 36, 22, 0)).toISOString(),
          durationMs: 8 * 60 * 1000 + 22 * 1000,
          reason: 'Awaria mechaniczna',
          customReason: '',
          comment: 'Pas przekładni wykazuje znaczne zużycie, zalecana wymiana w 30 dni.',
          media: [
            { id: id('m'), kind: 'image', photoId: photoIds.p5, originalId: originalIds.o5,
              filename: 'IMG_20260518_132845.jpg', mimeType: 'image/jpeg', size: 156000,
              description: 'Pas przekładni — widać zużycie' },
          ],
        },
      ],
      observations: 'Maszyna pracuje stabilnie w cyklu nominalnym 120 cykli/min. Trzy zatrzymania w trakcie 6.5h sesji — wszystkie zdiagnozowane i obsłużone.',
      conclusions: 'Zalecam planową wymianę pasa przekładni głównej w terminie 30 dni. Pozostałe parametry pracy w normie. Następna kontrola serwisowa: za 3 miesiące.',
      generalMedia: [
        { id: id('m'), kind: 'image', photoId: photoIds.p1, originalId: originalIds.o1,
          filename: 'IMG_20260518_080001.jpg', mimeType: 'image/jpeg', size: 142000,
          description: 'Widok ogólny stanowiska przed startem sesji' },
      ],
    },

    // 2. Service report — completed, recent
    {
      id: id('r'),
      type: 'service',
      status: 'completed',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      header: {
        reportNumber: 'SRV-2026-042',
        projectName: '25-312-M1',
        machineName: 'Linia montażowa LMA-2',
        date: todayMinus(1),
        author: 'Łukasz Cecelon',
      },
      visit: {
        client: 'BSH-Łódź',
        location: 'ul. Papiernicza 7, Łódź — hala B',
        arrival: '08:15',
        departure: '13:40',
      },
      actions: [
        {
          id: id('a'), category: 'Mechanika',
          description: 'Wymiana łożyska wałka napędowego (stacja 4). Wymontowano stare łożysko 6204-2RS, zamontowano nowe wraz z uszczelnieniem. Sprawdzono współosiowość — w normie.',
          media: [],
        },
        {
          id: id('a'), category: 'Elektryka',
          description: 'Naprawa rozdzielnicy bocznej — wymieniono wyłącznik krańcowy SW14 na model SW16 (kompatybilny zamiennik o wyższej trwałości). Przetestowano cykl pracy.',
          media: [
            { id: id('m'), kind: 'image', photoId: photoIds.p3, originalId: originalIds.o3,
              filename: 'IMG_20260517_103212.jpg', mimeType: 'image/jpeg', size: 158000,
              description: 'Rozdzielnica po wymianie wyłącznika' },
          ],
        },
        {
          id: id('a'), category: 'Pneumatyka',
          description: 'Kalibracja siłownika podającego detal. Dostrojono ciśnienie do 5.5 bar (poprzednio 5.0 bar — zbyt niskie dla nowej serii detali).',
          media: [],
        },
      ],
      parts: [
        { id: id('p'), name: 'Łożysko kulkowe 6204-2RS', catalogNo: 'SKF-6204-2RS', priority: 'planned', comment: 'Wymienione dziś' },
        { id: id('p'), name: 'Wyłącznik krańcowy SW16', catalogNo: 'IFM-EFB203-SW16', priority: 'planned', comment: 'Wymieniony dziś — zamiennik SW14' },
        { id: id('p'), name: 'Pas zębaty AT5-450', catalogNo: 'CONTINENTAL-AT5-450', priority: 'urgent', comment: 'Do wymiany w ciągu 14 dni — silne zużycie' },
      ],
      observations: 'Linia montażowa LMA-2 wykazuje typowe oznaki zużycia po 18 miesiącach intensywnej eksploatacji. Klient pracuje w trybie 2-zmianowym — zalecam wprowadzenie harmonogramu przeglądów kwartalnych.',
      recommendations: 'Pilne: wymiana pasa zębatego w ciągu 14 dni. Planowe: kontrola łożysk pozostałych wałków podczas następnej wizyty. Rozważyć modernizację układu sterowania do wersji v2.3.',
      visitStatus: 'followup',
      media: [
        { id: id('m'), kind: 'image', photoId: photoIds.p6, originalId: originalIds.o6,
          filename: 'IMG_20260517_134022.jpg', mimeType: 'image/jpeg', size: 168000,
          description: 'Widok ogólny linii po zakończeniu wizyty' },
      ],
    },

    // 3. Prototype report — Test #3, conditional positive
    {
      id: id('r'),
      type: 'prototype',
      status: 'completed',
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      header: {
        reportNumber: 'PT-2026-007',
        projectName: '25-104',
        machineName: 'Stanowisko testowe ST-1',
        date: todayMinus(3),
        author: 'Łukasz Cecelon',
      },
      info: {
        component: 'Chwytak mechaniczny v3',
        iteration: 3,
        sampleMethod: 'print3d',
        sampleMethodOther: '',
        goal: 'Weryfikacja siły chwytu po pogrubieniu palców z 4mm do 6mm. Cel: utrzymanie detalu 2.5kg bez poślizgu przy przyspieszeniu 3g.',
        media: [
          { id: id('m'), kind: 'image', photoId: photoIds.p4, originalId: originalIds.o4,
            filename: 'IMG_20260515_140330.jpg', mimeType: 'image/jpeg', size: 132000,
            description: 'Chwytak v3 zamontowany na ramieniu testowym' },
        ],
      },
      conditions: {
        setup: 'Ramię testowe z indeksowanym ruchem cyklicznym. Detal: stalowy walec ø80mm × 120mm (2.4kg). Cykl: chwyt → ruch 500mm w 0.3s → zwolnienie.',
        params: [
          { id: id('q'), key: 'Ciśnienie układu',         value: '5.5 bar' },
          { id: id('q'), key: 'Cykl testowy',              value: '500 powtórzeń' },
          { id: id('q'), key: 'Temperatura otoczenia',     value: '22°C' },
          { id: id('q'), key: 'Masa detalu testowego',     value: '2.4 kg' },
          { id: id('q'), key: 'Przyspieszenie szczytowe',  value: '2.8 g' },
        ],
      },
      points: [
        {
          id: id('pt'), description: 'Siła chwytu w warunkach nominalnych', result: 'ok',
          comment: 'Stabilna w całej serii 500 cykli.',
          media: [],
        },
        {
          id: id('pt'), description: 'Brak poślizgu przy przyspieszeniu 2.8g', result: 'ok',
          comment: 'Margines bezpieczeństwa ~15%.',
          media: [],
        },
        {
          id: id('pt'), description: 'Zachowanie po 500 cyklach (zużycie palców)', result: 'cond',
          comment: 'Widoczne lekkie zarysowania na powierzchni chwytnej — do obserwacji w kolejnym teście.',
          media: [],
        },
        {
          id: id('pt'), description: 'Hałas pracy', result: 'ok',
          comment: '< 65 dB w odległości 1m.',
          media: [],
        },
      ],
      overallResult: 'conditional',
      resultsMedia: [],
      observations: 'Pogrubienie palców z 4mm do 6mm rozwiązało problem deformacji występujący w Teście #2. Nowy problem: lekkie zarysowanie powierzchni chwytnej — wymaga obserwacji. Materiał PETG-CF sprawdza się jako kompromis sztywność/waga.',
      observationsMedia: [],
      decision: 'iterate',
      decisionNotes: 'Test #4: zmiana powierzchni chwytnej palców na elastomerową wkładkę TPU 95A. Cel: eliminacja zarysowań przy zachowaniu siły chwytu. Termin: tydzień 21.',
      media: [],
    },
  ]

  return { reports, idbSeed }
}
