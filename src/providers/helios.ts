import { getJson } from "../http";
import type { CinemaProvider, FetchLike, SourceCinema, SourceShowtime, Venue } from "../types";
import { cityList } from "../cities";
import { withZoneOffset } from "../util";
import { splitTitle } from "./coigdzie";

/**
 * Helios, via the CMS API behind helios.pl. One request returns a cinema's whole schedule
 * (about 2 months ahead):
 *   GET https://api.helios.pl/api/v1/cinemas/{cmsId}/screenings
 *     -> data.movies["m4423"]  = { title, duration, genres[{ name }], posterPhoto: { url } }
 *        data.events["e2714"]  = { name, duration, genres, posterPhoto }   (special screenings)
 *        data.screenings["YYYY-MM-DD"]["m4423" | "e2714"].screenings[] = {
 *          timeFrom: "2026-10-06 12:30:00", sourceId, cinemaSourceId,
 *          moviePrint: { printType: "2D" | "3D", speakingTypeLabel: "Napisy" | "Dubbing" | null } | null }
 * Cinema ids (`id` in GET /api/v1/cinemas) come from `heliosId` in the city lists (src/cities).
 */
const API = "https://api.helios.pl/api/v1/cinemas";
const TICKET = "https://bilety.helios.pl/screen";
const CACHE_TTL_MS = 10 * 60 * 1000;

type HeliosTitle = {
  title?: string;
  name?: string;
  duration?: number;
  genres?: { name?: string }[];
  posterPhoto?: { url?: string } | null;
};

type HeliosScreening = {
  timeFrom?: string;
  sourceId?: string;
  cinemaSourceId?: string;
  moviePrint?: { printType?: string | null; speakingTypeLabel?: string | null } | null;
};

export type HeliosData = {
  movies?: Record<string, HeliosTitle>;
  events?: Record<string, HeliosTitle>;
  screenings?: Record<string, Record<string, { screenings?: HeliosScreening[] }>>;
};

/** "2D, napisy" from a screening's print, plus any version marker left in the title. */
function heliosFormat(print: HeliosScreening["moviePrint"], fromTitle: string | undefined): string | undefined {
  const projection = print?.printType?.trim();
  const language = print?.speakingTypeLabel?.trim().toLowerCase();
  const parts = [projection, language].filter((p): p is string => !!p);
  if (!parts.length) return fromTitle;
  return [...new Set([...parts, ...(fromTitle?.split(", ") ?? [])])].join(", ");
}

export function parseHeliosScreenings(data: HeliosData, cinema: string, city: string, date: string): SourceShowtime[] {
  const out: SourceShowtime[] = [];
  for (const [key, block] of Object.entries(data.screenings?.[date] ?? {})) {
    // "m…" keys are films, "e…" keys are events (special screenings, film clubs).
    const info = data.movies?.[key] ?? data.events?.[key];
    const raw = (info?.title ?? info?.name)?.trim();
    if (!raw) continue;
    const { title, format } = splitTitle(raw);
    for (const s of block.screenings ?? []) {
      if (!s.timeFrom?.startsWith(date)) continue;
      out.push({
        cinema,
        city,
        movie: title,
        start: withZoneOffset(s.timeFrom.replace(" ", "T")),
        format: heliosFormat(s.moviePrint, format),
        bookingUrl: s.sourceId && s.cinemaSourceId ? `${TICKET}/${s.sourceId}?cinemaId=${s.cinemaSourceId}` : undefined,
        genre: info?.genres?.map((g) => g.name).filter(Boolean).join(", ") || undefined,
        posterUrl: info?.posterPhoto?.url,
        lengthMinutes: info?.duration,
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
