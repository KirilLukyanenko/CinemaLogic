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

| Order | Source | Covers | How |
|---|---|---|---|
| 1 | [kino.coigdzie.pl](https://kino.coigdzie.pl/miasto/warszawa) | every cinema in the city: chains, arthouse, cultural centres | one server-rendered HTML page per city and day, parsed with `node-html-parser` (`src/providers/coigdzie.ts`) |
| 2 | Cinema City API | Cinema City only | JSON service used by cinema-city.pl; used only when the portal fails or returns nothing |

The portal writes versions into the title ("Avengers 3D (dubbing)"). Those markers move into `format` ("3D, dubbing"), so `getMovies` groups all versions of a film together. Times without an online booking link point `bookingUrl` to the cinema's page on the portal.

Sources name cinemas differently ("Cinema City Warszawa Galeria Północna", "Kino Luna w Warszawie"). `src/cities/warszawa.ts` lists every Warsaw cinema with its address and district, plus the words that identify it, so every source maps onto the same names. Cinemas the portal knows but the list misses are still returned under the portal's name.

On 6 October 2026 the portal had 27 Warsaw cinema entries, and all of them map onto the list. KinoGram, U-jazdowski, ADA and Dom Sztuki are on the list but not on the portal that day, so they have no showtimes yet.

To add a source, implement `CinemaProvider` (`getShowtimes(city, date)`, `listCinemas(city)`) in `src/providers/` and add it to `defaultProviders()`. Check each site's terms of use first.

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
