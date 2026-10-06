import { getJson } from "../http";
import type { Cinema, CinemaProvider, FetchLike, ProviderShowtime } from "../types";
import { normalize, withZoneOffset } from "../util";

/**
 * Cinema City Poland, via the JSON "quickbook" service its own website uses
 * (no key needed). 10103 is the Polish tenant.
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

/** "2D, napisy" / "IMAX 3D, dubbing" from Cinema City attribute ids. */
export function formatFromAttributes(attributeIds: string[] = []): string | undefined {
  const attrs = new Set(attributeIds.map((a) => a.toLowerCase()));
  const projection = PROJECTION.filter(([id]) => attrs.has(id)).map(([, label]) => label);
  // "IMAX 3D" reads naturally; drop 2D when a premium format is present.
  const premium = projection.filter((p) => p !== "2D" && p !== "3D");
  const shown = premium.length ? [...premium, ...projection.filter((p) => p === "3D")] : projection;
  const language = LANGUAGE.find(([id]) => attrs.has(id))?.[1];
  const parts = [shown.join(" "), language].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function cinemaName(displayName: string): string {
  return /cinema city/i.test(displayName) ? displayName : `Cinema City ${displayName}`;
}

export class CinemaCityProvider implements CinemaProvider {
  readonly name = "cinema-city";
  private cinemas?: { at: number; list: Cinema[] };

  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listCinemas(city: string): Promise<Cinema[]> {
    const all = await this.allCinemas();
    const wanted = normalize(city);
    return all.filter((c) => normalize(c.city) === wanted);
  }

  async getShowtimes(cinema: Cinema, date: string): Promise<ProviderShowtime[]> {
    const id = cinema.id.slice(this.name.length + 1);
    const url = `${BASE}/film-events/in-cinema/${encodeURIComponent(id)}/at-date/${date}?attr=&lang=${LANG}`;
    const data = await getJson<Envelope<{ films?: CcFilm[]; events?: CcEvent[] }>>(this.fetchFn, url);
    const films = new Map((data.body?.films ?? []).map((f) => [f.id, f]));

    return (data.body?.events ?? [])
      .filter((ev) => ev.eventDateTime?.startsWith(date))
      .map((ev) => {
        const film = films.get(ev.filmId);
        return {
          cinema: cinema.name,
          city: cinema.city,
          movie: film?.name?.trim() || "Unknown",
          start: withZoneOffset(ev.eventDateTime),
          format: formatFromAttributes(ev.attributeIds),
          bookingUrl: ev.bookingLink || ev.bookingRouterLaunchLink || film?.link,
          posterUrl: film?.posterLink,
          lengthMinutes: film?.length,
        };
      });
  }

  private async allCinemas(): Promise<Cinema[]> {
    const nowMs = this.now().getTime();
    if (this.cinemas && nowMs - this.cinemas.at < CINEMA_LIST_TTL_MS) return this.cinemas.list;

    // Ask for cinemas with screenings in the next year: that is every open cinema.
    const until = new Date(nowMs + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `${BASE}/cinemas/with-event/until/${until}?attr=&lang=${LANG}`;
    const data = await getJson<Envelope<{ cinemas?: CcCinema[] }>>(this.fetchFn, url);
    const list = (data.body?.cinemas ?? []).map(
      (c): Cinema => ({
        id: `${this.name}:${c.id}`,
        provider: this.name,
        name: cinemaName(c.displayName ?? c.id),
        city: c.addressInfo?.city?.trim() ?? "",
        address: c.addressInfo?.address1,
        url: c.link,
        hasShowtimes: true,
      }),
    );
    this.cinemas = { at: nowMs, list };
    return list;
  }
}
