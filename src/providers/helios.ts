import { getJson } from "../http";
import type { CinemaProvider, FetchLike, SourceCinema, SourceShowtime, Venue } from "../types";
import { cityList } from "../cities";
import { withZoneOffset } from "../util";
import { splitTitle } from "./coigdzie";

/**
 * Helios, via the CMS API behind helios.pl. One request returns a cinema's whole schedule:
 *   GET https://api.helios.pl/api/v1/cinemas/{cmsId}/screenings
 *     -> data.movies["m123"] = { title }
 *        data.screenings["YYYY-MM-DD"]["m123"].screenings[] = { timeFrom, sourceId, cinemaSourceId }
 * Cinema ids come from `heliosId` in the city lists (src/cities).
 */
const API = "https://api.helios.pl/api/v1/cinemas";
const TICKET = "https://bilety.helios.pl/screen";
const CACHE_TTL_MS = 10 * 60 * 1000;

type HeliosData = {
  movies?: Record<string, { title?: string }>;
  screenings?: Record<string, Record<string, { screenings?: { timeFrom?: string; sourceId?: string; cinemaSourceId?: string }[] }>>;
};

export function parseHeliosScreenings(data: HeliosData, cinema: string, city: string, date: string): SourceShowtime[] {
  const out: SourceShowtime[] = [];
  for (const [movieKey, block] of Object.entries(data.screenings?.[date] ?? {})) {
    const raw = data.movies?.[movieKey]?.title?.trim();
    if (!raw) continue;
    const { title, format } = splitTitle(raw);
    for (const s of block.screenings ?? []) {
      if (!s.timeFrom?.startsWith(date)) continue;
      out.push({
        cinema,
        city,
        movie: title,
        start: withZoneOffset(s.timeFrom.replace(" ", "T")),
        format,
        bookingUrl: s.sourceId && s.cinemaSourceId ? `${TICKET}/${s.sourceId}?cinemaId=${s.cinemaSourceId}` : undefined,
      });
    }
  }
  return out;
}

export class HeliosProvider implements CinemaProvider {
  readonly name = "helios";
  private cache = new Map<string, { at: number; data: Promise<HeliosData> }>();

  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
    /** Replaces the city lists, e.g. for another city or for tests. */
    private readonly venueOverride?: Venue[],
  ) {}

  async listCinemas(city: string): Promise<SourceCinema[]> {
    return this.venues(city).map((v) => ({ name: v.name, address: v.address, url: v.url }));
  }

  async getShowtimes(city: string, date: string): Promise<SourceShowtime[]> {
    const perCinema = await Promise.all(
      this.venues(city).map(async (v) => parseHeliosScreenings(await this.schedule(v.heliosId!), v.name, city, date)),
    );
    return perCinema.flat();
  }

  private venues(city: string): Venue[] {
    const venues = this.venueOverride ?? cityList(city)?.venues ?? [];
    return venues.filter((v) => v.chain === "helios" && v.heliosId);
  }

  private schedule(id: string): Promise<HeliosData> {
    const nowMs = this.now().getTime();
    const hit = this.cache.get(id);
    if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.data;
    const data = getJson<{ data?: HeliosData }>(this.fetchFn, `${API}/${id}/screenings`).then((r) => r.data ?? {});
    this.cache.set(id, { at: nowMs, data });
    data.catch(() => this.cache.delete(id));
    return data;
  }
}
