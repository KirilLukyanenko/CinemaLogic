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

Two kinds of source run together. Status as checked live on 2026-10-06:

| Kind | Source | Covers | Status |
|---|---|---|---|
| Portal | [kino.coigdzie.pl](https://kino.coigdzie.pl/miasto/warszawa) (`src/providers/coigdzie.ts`) | every cinema in the city, **today and the next 6 days only**; lags behind the cinemas' own schedules | ✅ verified live |
| Direct | Cinema City quickbook API (`src/providers/cinemaCity.ts`) | the 6 Cinema City cinemas in Warsaw (Janki is listed as its own town) | ✅ verified live |
| Direct | Helios CMS API (`src/providers/helios.ts`) | Helios Blue City (`heliosId: "26"`) | ✅ parser verified against a live response (fetched with curl; this sandbox's egress policy blocks the host for Node) |
| Direct | KinoGram ticketing API (`src/providers/kinogram.ts`) | KinoGram | ✅ verified live; lists screenings the portal does not have yet |
| Direct | Multikino microservice (`src/providers/multikino.ts`) | the 5 Warsaw Multikinos (`multikinoId` filled in) | ⚠️ not verified: multikino.pl answered 403 from this sandbox. If it fails in production, the portal's data for those cinemas stays |

How each source is read:

- **kino.coigdzie.pl**: `GET /miasto/{city slug}/dzien/{weekday}`, e.g. `/miasto/warszawa/dzien/niedziela`. City slugs are ASCII (`krakow`, `bielsko-biala`). The day is a Polish weekday name, so only today and the next 6 days exist; an ISO date in the URL is ignored and another day is served. Dates outside that window return nothing without a request, and a page whose times are all on another day is treated as a failure. Times that have already started have no ticket link (`span.old.badge`); they point to the cinema's page on the portal.
- **Cinema City**: `GET /pl/data-api-service/v1/quickbook/10103/cinemas/with-event/until/{date}` (cached 6 h), then `film-events/in-cinema/{id}/at-date/{date}` per cinema (4 at a time). `attributeIds` become `format`: `2d`/`3d`/`imax`/`4dx`/`screenx` plus `subbed` → "napisy", `dubbed` → "dubbing" (`dubbed-lang-uk` → "dubbing ukraiński"). Version suffixes in film names ("… ukraiński dubbing", "… Infinity Vision") are dropped from the title.
- **Helios**: `GET https://api.helios.pl/api/v1/cinemas/{id}/screenings` returns about two months in one response (cached 10 min). The id is `id` in `GET /api/v1/cinemas`. Keys `m…` are films and `e…` are special events. `moviePrint.printType` and `speakingTypeLabel` give "2D, napisy" / "3D, dubbing".
- **KinoGram**: settings from `https://kinogram.pl/config.js`. `GET https://api2bilety.kinogram.pl/api/cinema/{cinemaId}/screening?dateTimeFrom=&dateTimeTo=` returns the screenings (only those that start *and end* inside the window, so the window runs to 08:00 the next morning). Then `GET /api/movie/{movieId}` for each title (cached 6 h, 2 at a time). Booking links are `https://bilety.kinogram.pl/reservation/places/{screening id}`. `printType` plus `subtitles` give "2D, napisy" (Polish subtitles) or "2D, napisy EN".
- **Multikino**: `POST /api/microservice/auth/token` for a session cookie, then `GET /api/microservice/showings/cinemas/{id}/films?showingDate=`. The ids come from the cinemas' booking links on the portal (`/rezerwacja-biletow/podsumowanie/{id}/…`): Złote Tarasy 0013, Targówek 0024, Wola Park 0025, Młociny 0040, Reduta 0052.

For every cinema a direct source returns showtimes for, its data replaces the portal's. Every other cinema keeps the portal's data, and if a direct source fails, the portal's data for its cinemas stays. If the portal is down, the direct sources still work.

The portal writes versions into the title ("Avengers 3D (dubbing)", "Lalka (seans z audiodeskrypcją)"). Those markers move into `format` ("3D, dubbing", "audiodeskrypcja"), so `getMovies` groups all versions of a film together. Titles that differ only in punctuation between sources ("The Social Reckoning: W sieci…" and "The Social Reckoning. W sieci…") are grouped too. Times without an online booking link point `bookingUrl` to the cinema's page on the portal.

Sources name cinemas differently ("Cinema City Warszawa Galeria Północna", "Kino Luna w Warszawie"). `src/cities/warszawa.ts` lists every Warsaw cinema with its address and district, plus the words that identify it, so every source maps onto the same names. Cinemas the portal knows but the list misses are still returned under the portal's name.

The Warsaw list has 36 cinemas. It was checked against everything the portal listed for Warsaw from January to October 2026; every regular cinema there maps onto it. Terminal Kultury Gocław was added in October 2026, and the portal now lists ADA as "Kino ADA w Artystycznym Domu Animacji". Small venues often show films only a few days a week, so a cinema missing on one day usually just has no screenings that day.

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
npm test               # unit tests with saved responses (no network)
npm run typecheck
npm run demo -- Warszawa 2026-10-06   # live lookup, plus counts per source and per cinema
```

### Test fixtures

`test/fixtures/live/` holds trimmed real responses saved on 2026-10-06: the portal's Warsaw pages for Sunday 2026-10-11 and today, Cinema City's cinema list and some events, Helios Blue City's schedule, and KinoGram's screenings and movies for 2026-10-11. `test/liveFixtures.test.ts` serves them at their real URLs. The Multikino fixture in `test/fixtures/chains.ts` is still hand-written in the API's shape, because multikino.pl could not be reached from the sandbox.
