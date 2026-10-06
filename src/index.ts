import { canonicalCity, cityList } from "./cities";
import { CinemaCityProvider } from "./providers/cinemaCity";
import { CoigdzieProvider } from "./providers/coigdzie";
import type { Cinema, CinemaProvider, FetchLike, Movie, Showtime, ShowtimeQuery, SourceShowtime, Venue } from "./types";
import { containsWords, isIsoDate, normalize, slugify } from "./util";

export * from "./types";
export { CinemaCityProvider, formatFromAttributes } from "./providers/cinemaCity";
export { CoigdzieProvider, parseDayPage, splitTitle } from "./providers/coigdzie";
export { WARSZAWA } from "./cities/warszawa";

export type CinemaLogicOptions = {
  /**
   * Schedule sources in order of preference. The first one that returns
   * showtimes wins; the rest are fallbacks for when it fails or comes back empty.
   */
  providers?: CinemaProvider[];
  /** Called when a source fails; the next source is tried. */
  onError?: (error: unknown, context: { provider: string }) => void;
};

/** kino.coigdzie.pl (every cinema in the city), then the Cinema City API as a fallback. */
export function defaultProviders(fetchFn?: FetchLike): CinemaProvider[] {
  return [new CoigdzieProvider(fetchFn), new CinemaCityProvider(fetchFn)];
}

const CHAIN_WORDS: Record<NonNullable<Venue["chain"]>, string> = {
  "cinema-city": "cinema city",
  multikino: "multikino",
  helios: "helios",
};

/** The venue a source's cinema name refers to, if the city has a static list. */
function findVenue(venues: Venue[], sourceName: string): Venue | undefined {
  return venues.find(
    (v) => (!v.chain || containsWords(sourceName, CHAIN_WORDS[v.chain])) && v.match.some((m) => containsWords(sourceName, m)),
  );
}

export function createCinemaLogic(options: CinemaLogicOptions = {}) {
  const providers = options.providers ?? defaultProviders();
  const onError = options.onError ?? (() => {});

  /**
   * Every cinema in the city: the city's static list (src/cities), plus any cinema
   * a source knows that the list is missing.
   */
  async function getCinemas(city: string): Promise<Cinema[]> {
    const name = canonicalCity(city);
    const venues = cityList(city)?.venues ?? [];
    const cinemas = new Map<string, Cinema>();
    for (const v of venues) {
      cinemas.set(v.name, { id: slugify(v.name), name: v.name, city: name, address: v.address, district: v.district, url: v.url });
    }

    for (const provider of providers) {
      try {
        for (const c of await provider.listCinemas(name)) {
          const venue = findVenue(venues, c.name);
          const known = cinemas.get(venue?.name ?? c.name);
          if (known) {
            known.address ??= c.address;
            known.url ??= c.url;
          } else {
            cinemas.set(c.name, { id: slugify(c.name), name: c.name, city: name, address: c.address, url: c.url });
          }
        }
        break;
      } catch (error) {
        onError(error, { provider: provider.name });
      }
    }
    return [...cinemas.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  async function collect(opts: ShowtimeQuery): Promise<SourceShowtime[]> {
    if (!isIsoDate(opts.date)) throw new Error(`date must be YYYY-MM-DD, got "${opts.date}"`);
    const city = canonicalCity(opts.city);
    const venues = cityList(opts.city)?.venues ?? [];
    const wanted = opts.movie ? normalize(opts.movie) : undefined;

    let showtimes: SourceShowtime[] = [];
    for (const provider of providers) {
      try {
        showtimes = await provider.getShowtimes(city, opts.date);
        if (showtimes.length) break;
      } catch (error) {
        onError(error, { provider: provider.name });
      }
    }

    return showtimes
      .map((s) => ({ ...s, city, cinema: findVenue(venues, s.cinema)?.name ?? s.cinema }))
      .filter((s) => !wanted || normalize(s.movie).includes(wanted))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.cinema.localeCompare(b.cinema, "pl"));
  }

  /** All showtimes in the city on the date (optionally for one movie), sorted by time. */
  async function getShowtimes(opts: ShowtimeQuery): Promise<Showtime[]> {
    return (await collect(opts)).map(toShowtime);
  }

  /** All movies playing in the city on the date, each with every cinema and time. */
  async function getMovies(opts: ShowtimeQuery): Promise<Movie[]> {
    const movies = new Map<string, Movie>();
    for (const s of await collect(opts)) {
      const key = normalize(s.movie);
      let movie = movies.get(key);
      if (!movie) {
        movie = { title: s.movie, showtimes: [] };
        movies.set(key, movie);
      }
      movie.year ??= s.year;
      movie.genre ??= s.genre;
      movie.posterUrl ??= s.posterUrl;
      movie.lengthMinutes ??= s.lengthMinutes;
      movie.showtimes.push(toShowtime(s));
    }
    return [...movies.values()].sort((a, b) => a.title.localeCompare(b.title, "pl"));
  }

  return { getCinemas, getShowtimes, getMovies };
}

function toShowtime(s: SourceShowtime): Showtime {
  const showtime: Showtime = { cinema: s.cinema, city: s.city, movie: s.movie, start: s.start };
  if (s.format) showtime.format = s.format;
  if (s.bookingUrl) showtime.bookingUrl = s.bookingUrl;
  return showtime;
}

let shared: ReturnType<typeof createCinemaLogic> | undefined;
const instance = () => (shared ??= createCinemaLogic());

/** The function the app's /api/cinema route calls. */
export function getShowtimes(opts: ShowtimeQuery): Promise<Showtime[]> {
  return instance().getShowtimes(opts);
}

export function getMovies(opts: ShowtimeQuery): Promise<Movie[]> {
  return instance().getMovies(opts);
}

export function getCinemas(city: string): Promise<Cinema[]> {
  return instance().getCinemas(city);
}
