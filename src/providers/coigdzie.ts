import { parse, type HTMLElement } from "node-html-parser";
import { getText } from "../http";
import type { CinemaProvider, FetchLike, SourceCinema, SourceShowtime } from "../types";
import { todayInWarsaw, withZoneOffset } from "../util";

/**
 * kino.coigdzie.pl: a portal listing the schedule of every cinema in a city,
 * chains and small/arthouse ones alike. Pages are server-rendered HTML, one per
 * city and day, grouped by movie:
 *
 *   div.movie
 *     a.title | h2                 "Avengers: Koniec gry 3D (dubbing)"
 *     p.info                       "2026 | USA | akcja"
 *     div.cinema.row
 *       a.cinemaname[href]         "Kino Muranów w Warszawie"
 *       span.shows
 *         a[href=booking]?         wraps the time only when the cinema sells online
 *           span.badge[data-time]  "2026-10-06 19:30:00" (local time)
 */
const SITE = "https://kino.coigdzie.pl";
const CACHE_TTL_MS = 10 * 60 * 1000;

type ParsedDay = { showtimes: SourceShowtime[]; cinemas: SourceCinema[] };

const LANGUAGE = /\s*\((dubbing|napisy|lektor|[a-zA-Z]{2,4}\.)\)/gi;
const PROJECTION = /\s+(2D|3D|IMAX|4DX|ScreenX)(?=\s|$|\()/gi;

/** "Avengers: Koniec gry 3D (dubbing) - wersja rozszerzona" -> title without version + "3D, dubbing". */
export function splitTitle(raw: string): { title: string; format?: string } {
  const projection: string[] = [];
  const language: string[] = [];
  let title = raw.replace(LANGUAGE, (_, lang: string) => {
    language.push(lang.toLowerCase());
    return " ";
  });
  // Tokens can follow each other ("3D IMAX"), so strip until none are left.
  for (let prev = ""; prev !== title; ) {
    prev = title;
    title = title.replace(PROJECTION, (_, p: string) => {
      projection.push(p.toUpperCase() === "SCREENX" ? "ScreenX" : p.toUpperCase());
      return " ";
    });
  }
  title = title.replace(/\s+/g, " ").replace(/\s+-\s*$/, "").trim();
  const order = ["IMAX", "4DX", "ScreenX", "3D", "2D"];
  projection.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const format = [projection.join(" "), language.join(", ")].filter(Boolean).join(", ");
  return { title: title || raw.trim(), format: format || undefined };
}

/** "Kino Luna w Warszawie" -> "Kino Luna". */
export function cleanCinemaName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/\s+w\s+[A-ZĄĆĘŁŃÓŚŹŻ][^\s]*$/u, "")
    .trim();
}

function absolute(href: string | undefined): string | undefined {
  if (!href) return undefined;
  return href.startsWith("/") ? SITE + href : href;
}

function closestLink(el: HTMLElement): string | undefined {
  for (let node: HTMLElement | null = el; node; node = node.parentNode) {
    if (node.tagName === "A" && node.getAttribute("href")) return node.getAttribute("href");
    if (node.classList?.contains("cinema")) return undefined;
  }
  return undefined;
}

/** Parses one city/day page. Showtimes outside `date` (late-night spill-over) are dropped. */
export function parseDayPage(html: string, city: string, date: string): ParsedDay {
  const root = parse(html);
  const showtimes: SourceShowtime[] = [];
  const cinemas = new Map<string, SourceCinema>();

  for (const block of root.querySelectorAll("div.movie")) {
    const rawTitle = (block.querySelector("a.title") ?? block.querySelector("h2"))?.text.trim();
    if (!rawTitle) continue;
    const { title, format } = splitTitle(rawTitle);
    const info = block.querySelector("p.info")?.text.split("|").map((p) => p.trim());
    const year = info?.[0] && /^\d{4}$/.test(info[0]) ? info[0] : undefined;
    const genre = info?.[2] || undefined;

    for (const row of block.querySelectorAll("div.cinema.row")) {
      const nameEl = row.querySelector("a.cinemaname");
      const rawName = nameEl?.text.trim();
      if (!nameEl || !rawName) continue;
      const cinema = cleanCinemaName(rawName);
      const cinemaUrl = absolute(nameEl.getAttribute("href"));
      cinemas.set(cinema, { name: cinema, url: cinemaUrl });

      for (const badge of row.querySelectorAll("span.badge[data-time]")) {
        const dataTime = badge.getAttribute("data-time") ?? "";
        if (!dataTime.startsWith(date)) continue;
        showtimes.push({
          cinema,
          city,
          movie: title,
          start: withZoneOffset(dataTime.replace(" ", "T")),
          format,
          // Cinemas without online sales have a bare time: link to the cinema's page instead.
          bookingUrl: absolute(closestLink(badge)) ?? cinemaUrl,
          cinemaUrl,
          year,
          genre,
        });
      }
    }
  }
  return { showtimes, cinemas: [...cinemas.values()] };
}

export class CoigdzieProvider implements CinemaProvider {
  readonly name = "coigdzie";
  private cache = new Map<string, { at: number; day: Promise<ParsedDay> }>();

  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getShowtimes(city: string, date: string): Promise<SourceShowtime[]> {
    return (await this.day(city, date)).showtimes;
  }

  /** Cinemas with screenings today (the portal has no separate cinema index per city). */
  async listCinemas(city: string): Promise<SourceCinema[]> {
    return (await this.day(city, todayInWarsaw(this.now()))).cinemas;
  }

  private day(city: string, date: string): Promise<ParsedDay> {
    const key = `${city.toLowerCase()}|${date}`;
    const nowMs = this.now().getTime();
    const hit = this.cache.get(key);
    if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.day;

    // The portal's city slugs keep Polish letters: /miasto/kraków/dzien/2026-10-06
    const url = `${SITE}/miasto/${encodeURIComponent(city.toLowerCase())}/dzien/${date}`;
    const day = getText(this.fetchFn, url).then((html) => {
      const parsed = parseDayPage(html, city, date);
      // An empty page has been seen when the portal is struggling; treat it as a failure.
      if (!parsed.showtimes.length && !/class="[^"]*\bmovie\b/.test(html)) {
        throw new Error(`coigdzie: no schedule found at ${url}`);
      }
      return parsed;
    });
    this.cache.set(key, { at: nowMs, day });
    day.catch(() => this.cache.delete(key));
    return day;
  }
}
