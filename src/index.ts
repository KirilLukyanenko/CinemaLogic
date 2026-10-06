import { mapLimit } from "./http";
import { CinemaCityProvider } from "./providers/cinemaCity";
import type { Cinema, CinemaProvider, FetchLike, Movie, ProviderShowtime, Showtime, ShowtimeQuery } from "./types";
import { isIsoDate, normalize } from "./util";

export * from "./types";
export { CinemaCityProvider, formatFromAttributes } from "./providers/cinemaCity";

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

  /** Every cinema in the city, across all providers. */
  async function getCinemas(city: string): Promise<Cinema[]> {
    const lists = await Promise.all(
      providers.map(async (p) => {
        try {
          return await p.listCinemas(city);
        } catch (error) {
          onError(error, { provider: p.name });
          return [];
        }
      }),
    );
    return lists.flat().sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  async function collect(opts: ShowtimeQuery): Promise<ProviderShowtime[]> {
    if (!isIsoDate(opts.date)) throw new Error(`date must be YYYY-MM-DD, got "${opts.date}"`);
    const cinemas = await getCinemas(opts.city);
    const byProvider = new Map(providers.map((p) => [p.name, p]));
    const wanted = opts.movie ? normalize(opts.movie) : undefined;

    const perCinema = await mapLimit(cinemas, concurrency, async (cinema) => {
      const provider = byProvider.get(cinema.provider)!;
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
