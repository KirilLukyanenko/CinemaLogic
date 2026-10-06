import { getJson, mapLimit } from "../http";
import type { CinemaProvider, FetchLike, SourceCinema, SourceShowtime } from "../types";
import { normalize, withZoneOffset } from "../util";

/**
 * Cinema City Poland, via the JSON "quickbook" service its own website uses (no key needed).
 * 10103 is the Polish tenant.
 *   GET {BASE}/cinemas/with-event/until/{date}  -> body.cinemas[] = { id, displayName: "Warszawa - Arkadia", link, addressInfo: { address1, city } }
 *   GET {BASE}/film-events/in-cinema/{id}/at-date/{date}
 *     -> body.films[] = { id, name, length, posterLink, link }
 *        body.events[] = { filmId, eventDateTime (local, no offset), attributeIds: ["2d", "imax", "subbed", ...], bookingLink }
 * Cinemas are matched to a city by addressInfo.city, so "Janki" (outside Warsaw) is not a Warsaw cinema.
 */
const BASE = "https://www.cinema-city.pl/pl/data-api-service/v1/quickbook/10103";
const LANG = "pl_PL";
const CINEMA_LIST_TTL_MS = 6 * 60 * 60 * 1000;

type Envelope<T> = { body?: T };

type CcCinema = {
  id: string;
  displayName?: string;
  link?: string;
  addressInfo?: { address1?: string; city?: string };
};

type CcFilm = {
  id: string;
  name?: string;
  length?: number;
  posterLink?: string;
  link?: string;
};

type CcEvent = {
  id: string;
  filmId: string;
  eventDateTime: string; // local Warsaw time without offset, "2026-10-06T19:30:00"
  attributeIds?: string[];
  bookingLink?: string;
  bookingRouterLaunchLink?: string;
  soldOut?: boolean;
};

const PROJECTION: [string, string][] = [
  ["imax", "IMAX"],
  ["4dx", "4DX"],
  ["screenx", "ScreenX"],
  ["3d", "3D"],
  ["2d", "2D"],
];
const LANGUAGE: [string, string][] = [
  ["dubbed", "dubbing"],
  ["subbed", "napisy"],
];
/** Dubbing into a language other than Polish ("dubbed-lang-uk") is marked, so it is not mistaken for a Polish dub. */
const DUB_LANGUAGES: Record<string, string> = { uk: "ukraiński" };

/** "2D, napisy" / "IMAX 3D, dubbing" from Cinema City attribute ids. */
export function formatFromAttributes(attributeIds: string[] = []): string | undefined {
  const attrs = new Set(attributeIds.map((a) => a.toLowerCase()));
  const projection = PROJECTION.filter(([id]) => attrs.has(id)).map(([, label]) => label);
  // "IMAX 3D" reads naturally; drop 2D when a premium format is present.
  const premium = projection.filter((p) => p !== "2D" && p !== "3D");
  const shown = premium.length ? [...premium, ...projection.filter((p) => p === "3D")] : projection;
  let language = LANGUAGE.find(([id]) => attrs.has(id))?.[1];
  const dubbedInto = [...attrs].find((a) => a.startsWith("dubbed-lang-"))?.slice("dubbed-lang-".length);
  if (language === "dubbing" && dubbedInto && dubbedInto !== "pl") language = `dubbing ${DUB_LANGUAGES[dubbedInto] ?? dubbedInto}`;
  const parts = [shown.join(" "), language].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** "Warszawa -  Arkadia" -> "Cinema City Warszawa Arkadia". */
/**
 * Film names can carry the version ("Verity. Coraz większy mrok ukraiński dubbing",
 * "Avengers: Koniec gry – wersja rozszerzona Infinity Vision"); drop it so versions group together.
 */
function filmTitle(name: string | undefined): string | undefined {
  return name?.replace(/\s+(ukraiński dubbing|Infinity Vision)$/i, "").trim();
}

function cinemaName(displayName: string): string {
  const name = displayName.replace(/\s+-\s+/g, " ").replace(/\s+/g, " ").trim();
  return /cinema city/i.test(name) ? name : `Cinema City ${name}`;
}

export class CinemaCityProvider implements CinemaProvider {
  readonly name = "cinema-city";
  private cinemas?: { at: number; list: CcCinema[] };

  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCinemas(city: string): Promise<SourceCinema[]> {
    return (await this.cinemasIn(city)).map((c) => ({
      name: cinemaName(c.displayName ?? c.id),
      address: c.addressInfo?.address1,
      url: c.link,
    }));
  }

  async getShowtimes(city: string, date: string): Promise<SourceShowtime[]> {
    const cinemas = await this.cinemasIn(city);
    const perCinema = await mapLimit(cinemas, 4, (c) => this.cinemaShowtimes(c, city, date));
    return perCinema.flat();
  }

  private async cinemaShowtimes(c: CcCinema, city: string, date: string): Promise<SourceShowtime[]> {
    const url = `${BASE}/film-events/in-cinema/${encodeURIComponent(c.id)}/at-date/${date}?attr=&lang=${LANG}`;
    const data = await getJson<Envelope<{ films?: CcFilm[]; events?: CcEvent[] }>>(this.fetchFn, url);
    const films = new Map((data.body?.films ?? []).map((f) => [f.id, f]));

    return (data.body?.events ?? [])
      .filter((ev) => ev.eventDateTime?.startsWith(date))
      .map((ev) => {
        const film = films.get(ev.filmId);
        return {
          cinema: cinemaName(c.displayName ?? c.id),
          city,
          movie: filmTitle(film?.name) || "Unknown",
          start: withZoneOffset(ev.eventDateTime),
          format: formatFromAttributes(ev.attributeIds),
          bookingUrl: ev.bookingLink || ev.bookingRouterLaunchLink || film?.link,
          cinemaUrl: c.link,
          posterUrl: film?.posterLink,
          lengthMinutes: film?.length,
        };
      });
  }

  private async cinemasIn(city: string): Promise<CcCinema[]> {
    const wanted = normalize(city);
    return (await this.allCinemas()).filter((c) => normalize(c.addressInfo?.city ?? "") === wanted);
  }

  private async allCinemas(): Promise<CcCinema[]> {
    const nowMs = this.now().getTime();
    if (this.cinemas && nowMs - this.cinemas.at < CINEMA_LIST_TTL_MS) return this.cinemas.list;

    // Ask for cinemas with screenings in the next year: that is every open cinema.
    const until = new Date(nowMs + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `${BASE}/cinemas/with-event/until/${until}?attr=&lang=${LANG}`;
    const data = await getJson<Envelope<{ cinemas?: CcCinema[] }>>(this.fetchFn, url);
    const list = data.body?.cinemas ?? [];
    this.cinemas = { at: nowMs, list };
    return list;
  }
}
