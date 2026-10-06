# CinemaLogic

TypeScript logic for the mobile app: given a **city** and a **day**, find every movie playing, and every cinema and time where you can see it.

It uses only `fetch` and `Intl`: no `fs`, `puppeteer` or `child_process`. It runs in an Expo API route (Cloudflare), in Node, or in a Firebase function.

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

## Sources

| Provider | Status | How |
|---|---|---|
| Cinema City | ✅ | JSON "quickbook" service used by cinema-city.pl |
| Multikino, Helios, independent cinemas | not yet | implement `CinemaProvider` in `src/providers/` and add it to `defaultProviders()` |

Check each chain's terms of use before adding it.

## Use in the app

`examples/expo-api-route.ts` is a ready `app/api/cinema+api.ts` route:
`GET /api/cinema?city=Warszawa&date=2026-10-06` returns movies with their showtimes.

## Development

```sh
npm install
npm test               # unit tests with recorded-shape fixtures (no network)
npm run typecheck
npm run demo -- Warszawa 2026-10-06   # live lookup against the real sites
```
