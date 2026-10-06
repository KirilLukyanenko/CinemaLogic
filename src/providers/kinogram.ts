import { getJson, mapLimit } from "../http";
import type { CinemaProvider, FetchLike, SourceCinema, SourceShowtime } from "../types";
import { localDate, normalize, withZoneOffset } from "../util";
import { splitTitle } from "./coigdzie";

/**
 * KinoGram (Fabryka Norblina, Warsaw), via the ticketing API that both kinogram.pl and
 * bilety.kinogram.pl read (settings from https://kinogram.pl/config.js):
 *   GET {API}/cinema/{CINEMA_ID}/screening?dateTimeFrom=<ISO>&dateTimeTo=<ISO>
 *     -> [{ id, movieId, screeningTimeFrom: "2026-10-11T16:00:00+02:00", screeningTimeTo,
 *           printType: "2D", speakingType: "ORG", language: "PL", subtitles: "EN" }]
 *     Only screenings that start AND end inside the window are returned.
 *   GET {API}/movie/{movieId} -> { title, duration, yearOfProduction, genres[{ name }], posters[] }
 * A screening's booking page is bilety.kinogram.pl/reservation/places/{screening id}.
 * The ticket site lists screenings days before kino.coigdzie.pl does.
 */
const API = "https://api2bilety.kinogram.pl/api";
const CINEMA_ID = "13ef71b3-75f3-4504-a367-e3b6b41f92b9";
const BOOKING = "https://bilety.kinogram.pl/reservation/places";
const CINEMA: SourceCinema = { name: "KinoGram", address: "ul. Żelazna 51/53", url: "https://kinogram.pl/" };
const CITY = "warszawa";
const SCHEDULE_TTL_MS = 10 * 60 * 1000;
const MOVIE_TTL_MS = 6 * 60 * 60 * 1000;
/** A late screening may end after midnight; the window must cover its end. */
const LATE_END_MS = 8 * 60 * 60 * 1000;

export type KinogramScreening = {
  id?: string;
  movieId?: string;
  screeningTimeFrom?: string;
  printType?: string | null;
  speakingType?: string | null;
  language?: string | null;
  subtitles?: string | null;
};

export type KinogramMovie = {
  id?: string;
  title?: string;
  duration?: number;
  yearOfProduction?: string | null;
  genres?: { name?: string }[];
  posters?: string[] | string | null;
};

/** Series prefixes the cinema puts in front of titles (list from kinogram.pl's own script.js). */
const SERIES_PREFIX = /^\s*(Classy Monday|Mindfulness Cinema|Silne Razem|Przedpremiera|Przedpremiery|Maraton|Maratony|KinoGram Club)\s*[-–—:]\s*/i;

function kinogramFormat(s: KinogramScreening, fromTitle: string | undefined): string | undefined {
  const parts: string[] = [];
  if (s.printType) parts.push(s.printType);
  const subs = s.subtitles?.trim().toUpperCase();
  if (subs) parts.push(subs === "PL" ? "napisy" : `napisy ${subs}`);
  if (fromTitle) parts.push(...fromTitle.split(", "));
  return parts.length ? [...new Set(parts)].join(", ") : undefined;
}

/** Local Warsaw date ("2026-10-11") of an ISO time with offset. */
function warsawDate(iso: string): string {
  return localDate(new Date(iso));
}

export function parseKinogramScreenings(
  screenings: KinogramScreening[],
  movies: Record<string, KinogramMovie>,
  city: string,
  date: string,
): SourceShowtime[] {
  const out: SourceShowtime[] = [];
  for (const s of screenings) {
    if (!s.screeningTimeFrom || !s.movieId || warsawDate(s.screeningTimeFrom) !== date) continue;
    const movie = movies[s.movieId];
    const raw = movie?.title?.replace(SERIES_PREFIX, "").trim();
    if (!raw) continue;
    const { title, format } = splitTitle(raw);
    const poster = Array.isArray(movie?.posters) ? movie.posters[0] : movie?.posters;
    out.push({
      cinema: CINEMA.name,
      city,
      movie: title,
      start: withZoneOffset(s.screeningTimeFrom.slice(0, 19)),
      format: kinogramFormat(s, format),
      bookingUrl: s.id ? `${BOOKING}/${s.id}` : CINEMA.url,
      cinemaUrl: CINEMA.url,
      year: movie?.yearOfProduction || undefined,
      genre: movie?.genres?.map((g) => g.name?.toLowerCase()).filter(Boolean).join(", ") || undefined,
      posterUrl: poster || undefined,
      lengthMinutes: movie?.duration || undefined,
    });
  }
  return out;
}

/** UTC instant of local Warsaw midnight starting `date`. */
function warsawMidnight(date: string): Date {
  return new Date(withZoneOffset(`${date}T00:00:00`));
}

export class KinogramProvider implements CinemaProvider {
  readonly name = "kinogram";
  private schedules = new Map<string, { at: number; data: Promise<KinogramScreening[]> }>();
  private movies = new Map<string, { at: number; data: Promise<KinogramMovie> }>();

  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCinemas(city: string): Promise<SourceCinema[]> {
    return normalize(city) === CITY ? [CINEMA] : [];
  }

  async getShowtimes(city: string, date: string): Promise<SourceShowtime[]> {
    if (normalize(city) !== CITY) return [];
    const screenings = await this.schedule(date);
    const ids = [...new Set(screenings.map((s) => s.movieId).filter((id): id is string => !!id))];
    const movies: Record<string, KinogramMovie> = {};
    await mapLimit(ids, 2, async (id) => {
      movies[id] = await this.movie(id);
    });
    return parseKinogramScreenings(screenings, movies, city, date);
  }

  private schedule(date: string): Promise<KinogramScreening[]> {
    const from = warsawMidnight(date);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 + LATE_END_MS);
    const url = `${API}/cinema/${CINEMA_ID}/screening?dateTimeFrom=${from.toISOString()}&dateTimeTo=${to.toISOString()}`;
    return this.cached(this.schedules, date, SCHEDULE_TTL_MS, () => getJson<KinogramScreening[]>(this.fetchFn, url));
  }

  private movie(id: string): Promise<KinogramMovie> {
    return this.cached(this.movies, id, MOVIE_TTL_MS, () => getJson<KinogramMovie>(this.fetchFn, `${API}/movie/${encodeURIComponent(id)}`));
  }

  private cached<T>(cache: Map<string, { at: number; data: Promise<T> }>, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const nowMs = this.now().getTime();
    const hit = cache.get(key);
    if (hit && nowMs - hit.at < ttl) return hit.data;
    const data = load();
    cache.set(key, { at: nowMs, data });
    data.catch(() => cache.delete(key));
    return data;
  }
}
