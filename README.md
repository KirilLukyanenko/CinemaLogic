# CinemaLogic

TypeScript logic for the mobile app: given a **city** and a **day**, find every movie playing, and every cinema and time where you can see it.

It uses only `fetch`, `Intl` and a pure-JS HTML parser: no `fs`, `puppeteer` or `child_process`. It runs in an Expo API route (Cloudflare), in Node, or in a Firebase function.

## API

```ts
import { getMovies, getShowtimes, getCinemas } from "./src";

await getCinemas("Warszawa");                                   // Cinema[]
await getMovies({ city: "Warszawa", date: "2026-10-06" });      // Movie[]: each movie with all its showtimes
await getShowtimes({ city: "Warszawa", date: "2026-10-06" });   // Showtime[], sorted by start time
await getShowtimes({ city: "Warszawa", date: "2026-10-06", movie: "diuna" }); // one movie
```

```ts
type Showtime = {
  cinema: string;      // "Cinema City Arkadia"
  city: string;        // "Warszawa"
  movie: string;       // "Diuna: Część druga"
  start: string;       // "2026-10-06T19:30:00+02:00"
  format?: string;     // "2D, napisy", "IMAX 3D, dubbing"
  bookingUrl?: string;
};
```

City and movie matching ignore case and Polish diacritics (`krakow` matches `Kraków`). If one cinema fails, the others are still returned; pass `onError` to `createCinemaLogic` to log failures.

## Where the data comes from

Two kinds of source run together:

| Kind | Source | Covers | Status |
|---|---|---|---|
| Portal | [kino.coigdzie.pl](https://kino.coigdzie.pl/miasto/warszawa) | every cinema in the city, but lags behind the cinemas' own schedules (often by days) | ✅ |
| Direct | Cinema City API | all Cinema City cinemas | ✅ |
| Direct | Multikino API (`src/providers/multikino.ts`) | cinemas with `multikinoId` in the city list | parser ready; Warsaw ids not filled in yet |
| Direct | Helios API (`src/providers/helios.ts`) | cinemas with `heliosId` in the city list | parser ready; Warsaw id not filled in yet |

For every cinema a direct source returns showtimes for, its data replaces the portal's. Every other cinema keeps the portal's data, and if a direct source fails, the portal's data for its cinemas stays. If the portal is down, the direct sources still work.

The portal writes versions into the title ("Avengers 3D (dubbing)"). Those markers move into `format` ("3D, dubbing"), so `getMovies` groups all versions of a film together. Times without an online booking link point `bookingUrl` to the cinema's page on the portal.

Sources name cinemas differently ("Cinema City Warszawa Galeria Północna", "Kino Luna w Warszawie"). `src/cities/warszawa.ts` lists every Warsaw cinema with its address and district, plus the words that identify it, so every source maps onto the same names. Cinemas the portal knows but the list misses are still returned under the portal's name.

The Warsaw list has 35 cinemas. It was checked against everything the portal listed for Warsaw from January to October 2026; every regular cinema there maps onto it. Small venues often show films only a few days a week, so a cinema missing on one day usually just has no screenings that day. ADA Kino Studyjne is the one cinema the portal never lists.

### Cinema website parsers

A parser for a single cinema's own site goes in `siteProviders`. It runs alongside the portal, and for every cinema it returns showtimes for, its data replaces the portal's. If it fails (for example after a site redesign), the portal's data for that cinema is used and `onError` is called.

Parsers must be written against the site's real HTML. `npm run snapshot` saves the schedule pages of KinoGram, U-jazdowski, ADA and Dom Sztuki into `test/fixtures/sites/`. Add a URL with `npm run snapshot -- ada https://...`.

To add a city-wide source, implement `CinemaProvider` (`getShowtimes(city, date)`, `listCinemas(city)`) in `src/providers/` and add it to `defaultProviders()`. Check each site's terms of use first.

## Use in the app

`examples/expo-api-route.ts` is a ready `app/api/cinema+api.ts` route:
`GET /api/cinema?city=Warszawa&date=2026-10-06` returns movies with their showtimes.

## Development

```sh
npm install
npm test               # unit tests with fixtures in the sites' markup (no network)
npm run typecheck
npm run demo -- Warszawa 2026-10-06   # live lookup against the real sites
```
