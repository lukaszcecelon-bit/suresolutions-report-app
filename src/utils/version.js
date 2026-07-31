// JEDNO źródło numeru wersji aplikacji.
//
// ZASADA WERSJONOWANIA: każda zmiana w kodzie bumpuje wersję TUTAJ oraz w
// package.json. Przedtem stała siedziała w App.jsx, ale od v0.52 potrzebują jej
// też moduły bez dostępu do drzewa Reacta (eksport analityczny stempluje nią
// każdy plik, żeby po pół roku było wiadomo, czym policzono liczby).
export const APP_VERSION = 'v0.53'
