import { mapLimit } from "./http";
import { CinemaCityProvider } from "./providers/cinemaCity";
import type { Cinema, CinemaProvider, FetchLike, Movie, ProviderShowtime, Showtime, ShowtimeQuery } from "./types";
import { canonicalCity, cityList } from "./cities";
import { containsWords, isIsoDate, normalize } from "./util";

export * from "./types";
export { CinemaCityProvider, formatFromAttributes } from "./providers/cinemaCity";
export { WARSZAWA } from "./cities/warszawa";

export type CinemaLogicOptions = {
  /** Schedule sources to query. Defaults to every built-in provider. */
  providers?: CinemaProvider[];
  /** Max cinemas fetched at once. */
  concurrency?: number;
  /** Called when one provider or cinema fails; the rest of the results are still returned. */
  onError?: (error: unknown, context: { provider: string; cinema?: string }) => void;
};

export function defaultProviders(fetchFn?: FetchLike): CinemaProvider[] {
  return [new CinemaCityProvider(fetchFn)];
}

export function createCinemaLogic(options: CinemaLogicOptions = {}) {
  const providers = options.providers ?? defaultProviders();
  const concurrency = options.concurrency ?? 4;
  const onError = options.onError ?? (() => {});

  /**
   * Every cinema in the city: what the providers return, merged with the city's
   * static list so cinemas without a schedule source still appear (hasShowtimes: false).
   */
  async function getCinemas(city: string): Promise<Cinema[]> {
    const name = canonicalCity(city);
    const lists = await Promise.all(
      providers.map(async (p) => {
        try {
          return await p.listCinemas(name);
        } catch (error) {
          onError(error, { provider: p.name });
          return [];
        }
      }),
    );
    const fromProviders = lists.flat();
    const unmatched = new Set(fromProviders);
    const merged: Cinema[] = [];

    for (const venue of cityList(city)?.venues ?? []) {
      const found = fromProviders.find(
        (c) => unmatched.has(c) && (!venue.chain || c.provider === venue.chain) && containsWords(c.name, venue.match),
      );
      if (found) {
        unmatched.delete(found);
        merged.push({ ...found, address: found.address ?? venue.address, district: venue.district, url: found.url ?? venue.url });
      } else {
        merged.push({
          id: `venue:${normalize(name)}:${venue.match.replace(/\s+/g, "-")}`,
          name: venue.name,
          city: name,
          address: venue.address,
          district: venue.district,
          url: venue.url,
          hasShowtimes: false,
        });
      }
    }
    merged.push(...unmatched);
    return merged.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  async function collect(opts: ShowtimeQuery): Promise<ProviderShowtime[]> {
    if (!isIsoDate(opts.date)) throw new Error(`date must be YYYY-MM-DD, got "${opts.date}"`);
    const cinemas = (await getCinemas(opts.city)).filter((c) => c.hasShowtimes && c.provider);
    const byProvider = new Map(providers.map((p) => [p.name, p]));
    const wanted = opts.movie ? normalize(opts.movie) : undefined;

    const perCinema = await mapLimit(cinemas, concurrency, async (cinema) => {
      const provider = byProvider.get(cinema.provider!)!;
      try {
        return await provider.getShowtimes(cinema, opts.date);
      } catch (error) {
        onError(error, { provider: provider.name, cinema: cinema.name });
        return [];
      }
    });

    return perCinema
      .flat()
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
        movie = { title: s.movie, posterUrl: s.posterUrl, lengthMinutes: s.lengthMinutes, showtimes: [] };
        movies.set(key, movie);
      }
      movie.posterUrl ??= s.posterUrl;
      movie.lengthMinutes ??= s.lengthMinutes;
      movie.showtimes.push(toShowtime(s));
    }
    return [...movies.values()].sort((a, b) => a.title.localeCompare(b.title, "pl"));
  }

  return { getCinemas, getShowtimes, getMovies };
}

function toShowtime(s: ProviderShowtime): Showtime {
  const { posterUrl: _p, lengthMinutes: _l, ...showtime } = s;
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
