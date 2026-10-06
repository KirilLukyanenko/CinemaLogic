import { getJson } from "../http";
import type { CinemaProvider, FetchLike, SourceCinema, SourceShowtime, Venue } from "../types";
import { cityList } from "../cities";
import { withZoneOffset } from "../util";
import { splitTitle } from "./coigdzie";

/**
 * Multikino, via the "showings" microservice its website uses:
 *   POST /api/microservice/auth/token   -> anonymous session cookie (required, else 401)
 *   GET  /api/microservice/showings/cinemas/{cinemaId}/films?showingDate=YYYY-MM-DD
 *     -> { result: [{ filmTitle, filmUrl, showingGroups: [{ sessions: [{ startTime, bookingUrl }] }] }] }
 * Cinema ids ("0004") come from `multikinoId` in the city lists (src/cities).
 */
const SITE = "https://www.multikino.pl";
const API = `${SITE}/api/microservice`;

type MkFilm = {
  filmTitle?: string;
  filmUrl?: string;
  showingGroups?: { sessions?: { startTime?: string; bookingUrl?: string }[] }[];
};

export function parseMultikinoFilms(films: MkFilm[], cinema: string, city: string, date: string): SourceShowtime[] {
  const out: SourceShowtime[] = [];
  for (const film of films) {
    const raw = film.filmTitle?.trim();
    if (!raw) continue;
    const { title, format } = splitTitle(raw);
    for (const group of film.showingGroups ?? []) {
      for (const session of group.sessions ?? []) {
        if (!session.startTime?.startsWith(date)) continue;
        const booking = session.bookingUrl;
        out.push({
          cinema,
          city,
          movie: title,
          start: withZoneOffset(session.startTime),
          format,
          bookingUrl: booking ? (booking.startsWith("/") ? SITE + booking : booking) : film.filmUrl,
        });
      }
    }
  }
  return out;
}

export class MultikinoProvider implements CinemaProvider {
  readonly name = "multikino";
  private cookie?: Promise<string>;

  /** `venueOverride` replaces the city lists, e.g. for another city or for tests. */
  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly venueOverride?: Venue[],
  ) {}

  async listCinemas(city: string): Promise<SourceCinema[]> {
    return this.venues(city).map((v) => ({ name: v.name, address: v.address, url: v.url }));
  }

  async getShowtimes(city: string, date: string): Promise<SourceShowtime[]> {
    const venues = this.venues(city);
    if (!venues.length) return [];
    const cookie = await this.session();
    const perCinema = await Promise.all(
      venues.map(async (v) => {
        const url = `${API}/showings/cinemas/${v.multikinoId}/films?showingDate=${date}`;
        const data = await getJson<{ result?: MkFilm[] }>((u, init) => this.fetchFn(u, withCookie(init, cookie)), url);
        return parseMultikinoFilms(data.result ?? [], v.name, city, date);
      }),
    );
    return perCinema.flat();
  }

  private venues(city: string): Venue[] {
    const venues = this.venueOverride ?? cityList(city)?.venues ?? [];
    return venues.filter((v) => v.chain === "multikino" && v.multikinoId);
  }

  private session(): Promise<string> {
    this.cookie ??= this.fetchFn(`${API}/auth/token`, { method: "POST", headers: { "Content-Type": "application/json" } }).then((res) => {
      if (!res.ok) throw new Error(`Multikino auth -> HTTP ${res.status}`);
      const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
      return cookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
    });
    this.cookie.catch(() => (this.cookie = undefined));
    return this.cookie;
  }
}

function withCookie(init: RequestInit | undefined, cookie: string): RequestInit {
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("Cookie", cookie);
  return { ...init, headers };
}
