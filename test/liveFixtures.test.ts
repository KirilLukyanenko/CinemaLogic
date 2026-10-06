// Parsers against trimmed real responses saved on 2026-10-06 (test/fixtures/live). No network.
import { describe, expect, it } from "vitest";
import {
  CinemaCityProvider,
  CoigdzieProvider,
  createCinemaLogic,
  formatFromAttributes,
  HeliosProvider,
  KinogramProvider,
  parseDayPage,
  parseHeliosScreenings,
  weekdayName,
} from "../src";
import type { FetchLike } from "../src";
import { live, liveJson } from "./fixtures/live";

const NOW = () => new Date("2026-10-06T13:00:00+02:00");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const KINOGRAM_API = "https://api2bilety.kinogram.pl/api";
const CC_EVENTS = /quickbook\/10103\/film-events\/in-cinema\/(\d+)\/at-date\/(\d{4}-\d{2}-\d{2})/;

/** Serves the saved responses at the URLs they were fetched from. */
function liveFetch(calls: string[] = []): FetchLike {
  const movies = liveJson("kinogram-movies.json") as Record<string, unknown>;
  return async (url) => {
    calls.push(url);
    if (url === "https://kino.coigdzie.pl/miasto/warszawa/dzien/niedziela") return new Response(live("coigdzie-warszawa-niedziela.html"));
    if (url === "https://kino.coigdzie.pl/miasto/warszawa/dzien/wtorek") return new Response(live("coigdzie-warszawa-wtorek.html"));
    if (url.includes("/quickbook/10103/cinemas/with-event/until/")) return json(liveJson("cinemacity-cinemas.json"));
    const cc = CC_EVENTS.exec(url);
    if (cc) {
      try {
        return json(liveJson(`cinemacity-events-${cc[1]}-${cc[2]}.json`));
      } catch {
        return json({ body: { films: [], events: [] } });
      }
    }
    if (url === "https://api.helios.pl/api/v1/cinemas/26/screenings") return json(liveJson("helios-26-screenings.json"));
    if (url.startsWith(`${KINOGRAM_API}/cinema/13ef71b3-75f3-4504-a367-e3b6b41f92b9/screening?`)) {
      return json(url.includes("dateTimeFrom=2026-10-10T22:00:00.000Z") ? liveJson("kinogram-screenings-2026-10-11.json") : []);
    }
    if (url.startsWith(`${KINOGRAM_API}/movie/`)) {
      const movie = movies[url.slice(`${KINOGRAM_API}/movie/`.length)];
      return movie ? json(movie) : json({}, 404);
    }
    return json({}, 404);
  };
}

describe("kino.coigdzie.pl (real page)", () => {
  it("reads every movie, cinema, time and booking link", () => {
    const { showtimes, cinemas } = parseDayPage(live("coigdzie-warszawa-niedziela.html"), "Warszawa", "2026-10-11");
    expect(showtimes).toHaveLength(31);
    expect(cinemas).toHaveLength(16);
    expect(showtimes.filter((s) => s.movie === "Lalka" && s.cinema === "Helios Warszawa Blue City").map((s) => s.start.slice(11, 16))).toEqual([
      "11:00", "14:30", "18:00", "21:30",
    ]);
    expect(showtimes.find((s) => s.cinema === "Helios Warszawa Blue City" && s.movie.startsWith("Bing"))).toEqual({
      cinema: "Helios Warszawa Blue City",
      city: "Warszawa",
      movie: "Bing i opowieści o zwierzątkach",
      start: "2026-10-11T10:30:00+02:00",
      format: "dubbing",
      bookingUrl: "https://bilety.helios.pl/screen/1b595548-de8a-4e7a-b8bd-af88b58a3f19?cinemaId=4ca060df-c4f2-4157-8905-bf46527aae58",
      cinemaUrl: "https://kino.coigdzie.pl/kino/helios-warszawa-blue-city-123953",
      year: "2021",
      genre: "animowany",
    });
    expect(showtimes.find((s) => s.movie.startsWith("The Social Reckoning"))?.format).toBe("ukr.");
  });

  it("keeps screenings that already started (no ticket link) and links them to the cinema page", () => {
    const { showtimes } = parseDayPage(live("coigdzie-warszawa-wtorek.html"), "Warszawa", "2026-10-06");
    expect(showtimes[0]).toMatchObject({
      cinema: "Cinema City Warszawa Arkadia",
      movie: "100 dni: Misja Zeus",
      start: "2026-10-06T14:20:00+02:00",
      bookingUrl: "https://kino.coigdzie.pl/kino/cinema-city-warszawa-arkadia-8436",
    });
    expect(showtimes[1]?.bookingUrl).toBe("https://tickets.cinema-city.pl/order/1719888?lang=pl");
  });

  it("asks for the day by weekday name and ASCII city slug, for today and the next 6 days only", async () => {
    const calls: string[] = [];
    const portal = new CoigdzieProvider(liveFetch(calls), NOW);
    expect(await portal.getShowtimes("Warszawa", "2026-10-11")).toHaveLength(31);
    expect(await portal.getShowtimes("Warszawa", "2026-10-13")).toEqual([]); // next Tuesday: no page yet
    expect(await portal.getShowtimes("Warszawa", "2026-10-05")).toEqual([]); // yesterday
    expect(calls).toEqual(["https://kino.coigdzie.pl/miasto/warszawa/dzien/niedziela"]);

    const krakow: string[] = [];
    await new CoigdzieProvider(liveFetch(krakow), NOW).getShowtimes("Kraków", "2026-10-07").catch(() => {});
    expect(krakow).toEqual(["https://kino.coigdzie.pl/miasto/krakow/dzien/%C5%9Broda"]);
  });

  it("rejects a page for another day", async () => {
    const wrongDay: FetchLike = async () => new Response(live("coigdzie-warszawa-wtorek.html"));
    await expect(new CoigdzieProvider(wrongDay, NOW).getShowtimes("Warszawa", "2026-10-11")).rejects.toThrow(/no showtimes on 2026-10-11/);
  });

  it("names weekdays in Polish", () => {
    expect(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-09", "2026-10-11"].map(weekdayName)).toEqual([
      "poniedziałek", "wtorek", "środa", "piątek", "niedziela",
    ]);
  });
});

describe("Cinema City (real responses)", () => {
  it("lists the six Warsaw cinemas (Janki is a separate town)", async () => {
    const cinemas = await new CinemaCityProvider(liveFetch(), NOW).listCinemas("Warszawa");
    expect(cinemas.map((c) => c.name)).toEqual([
      "Cinema City Warszawa Arkadia",
      "Cinema City Warszawa Bemowo",
      "Cinema City Warszawa Białołęka Galeria Północna",
      "Cinema City Warszawa Mokotów",
      "Cinema City Warszawa Promenada",
      "Cinema City Warszawa Sadyba",
    ]);
  });

  it("maps every Warsaw cinema onto the Warsaw list, with formats and booking links", async () => {
    const l = createCinemaLogic({ providers: [], siteProviders: [new CinemaCityProvider(liveFetch(), NOW)] });
    const showtimes = await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    expect(showtimes.map((s) => [s.cinema, s.start.slice(11, 16), s.format])).toEqual([
      ["Cinema City Arkadia", "15:30", "4DX, dubbing"],
      ["Cinema City Arkadia", "18:00", "4DX, napisy"],
      ["Cinema City Mokotów", "18:00", "ScreenX, napisy"],
      ["Cinema City Sadyba", "18:00", "IMAX"],
      ["Cinema City Arkadia", "18:45", "2D, dubbing ukraiński"],
    ]);
    expect(showtimes[0]?.bookingUrl).toBe("https://tickets.cinema-city.pl/api/order/1720916?lang=pl");
    expect(showtimes.map((s) => s.movie)).toEqual([
      "Zapomniana wyspa",
      "Verity. Coraz większy mrok",
      "Avengers: Koniec gry – wersja rozszerzona", // "… Infinity Vision" in the API
      "Lalka",
      "Verity. Coraz większy mrok", // "… ukraiński dubbing" in the API
    ]);
    const cinemas = await createCinemaLogic({ providers: [new CinemaCityProvider(liveFetch(), NOW)], siteProviders: [] }).getCinemas("Warszawa");
    expect(cinemas.filter((c) => c.name.startsWith("Cinema City")).map((c) => c.url)).toEqual([
      "https://www.cinema-city.pl/kina/arkadia",
      "https://www.cinema-city.pl/kina/bemowo",
      "https://www.cinema-city.pl/kina/galeriapolnocna",
      "https://www.cinema-city.pl/kina/mokotow",
      "https://www.cinema-city.pl/kina/promenada",
      "https://www.cinema-city.pl/kina/sadyba",
    ]);
  });

  it("marks dubbing into another language", () => {
    expect(formatFromAttributes(["2d", "dubbed", "dubbed-lang-uk"])).toBe("2D, dubbing ukraiński");
    expect(formatFromAttributes(["2d", "dubbed", "dubbed-lang-pl"])).toBe("2D, dubbing");
  });
});

describe("Helios (real response)", () => {
  it("reads films and special events with their print format", () => {
    const data = (liveJson("helios-26-screenings.json") as { data: Parameters<typeof parseHeliosScreenings>[0] }).data;
    const showtimes = parseHeliosScreenings(data, "Helios Blue City", "Warszawa", "2026-10-11");
    expect(showtimes.map((s) => [s.movie, s.start.slice(11, 16), s.format])).toEqual([
      ["Digger", "18:30", "2D, napisy"],
      ["Digger", "20:30", "2D, napisy"],
      ["Lalka", "11:00", "2D"],
      ["Lalka", "14:30", "2D"],
      ["Lalka", "18:00", "2D"],
      ["Bing i opowieści o zwierzątkach – seanse z konkursami HDD", "10:30", undefined],
    ]);
    expect(showtimes[2]).toMatchObject({
      bookingUrl: "https://bilety.helios.pl/screen/8f13be0c-210f-40ee-a96d-cd15e7a8b2d1?cinemaId=4ca060df-c4f2-4157-8905-bf46527aae58",
      lengthMinutes: 162,
      posterUrl: "https://img.helios.pl/pliki/film/lalka/lalka-plakat-245.jpg",
    });
  });

  it("reads Blue City by its CMS id from the Warsaw list", async () => {
    const calls: string[] = [];
    const showtimes = await new HeliosProvider(liveFetch(calls), NOW).getShowtimes("Warszawa", "2026-10-12");
    expect(calls).toEqual(["https://api.helios.pl/api/v1/cinemas/26/screenings"]);
    expect(showtimes).toHaveLength(1);
  });
});

describe("KinoGram (real responses)", () => {
  it("returns Lalka on 2026-10-11, which the portal does not list yet", async () => {
    const calls: string[] = [];
    const showtimes = await new KinogramProvider(liveFetch(calls), NOW).getShowtimes("Warszawa", "2026-10-11");
    const lalka = showtimes.filter((s) => s.movie === "Lalka");
    expect(lalka.map((s) => s.start.slice(11, 16)).sort()).toEqual(["13:00", "15:00", "16:00", "16:30", "18:30", "19:30", "20:00"]);
    expect(lalka.find((s) => s.start === "2026-10-11T16:00:00+02:00")).toEqual({
      cinema: "KinoGram",
      city: "Warszawa",
      movie: "Lalka",
      start: "2026-10-11T16:00:00+02:00",
      format: "2D, napisy EN",
      bookingUrl: "https://bilety.kinogram.pl/reservation/places/b4e6afd6-df3b-4242-9e09-8d5c4f8a5aac",
      cinemaUrl: "https://kinogram.pl/",
      genre: "kostiumowy, dramat",
      posterUrl: "https://i.ibb.co/d0Vk6g5y/7981-Easy-Resize-com.jpg",
      lengthMinutes: 165,
    });
    expect(showtimes.filter((s) => s.movie !== "Lalka").map((s) => [s.movie, s.format])).toEqual([
      ["Tony", "2D, napisy"],
      ["Digger", "2D, napisy"],
      ["Digger", "2D, napisy"],
    ]);
    // One schedule request covering the Warsaw day plus late endings, then each movie once.
    expect(calls[0]).toBe(
      `${KINOGRAM_API}/cinema/13ef71b3-75f3-4504-a367-e3b6b41f92b9/screening?dateTimeFrom=2026-10-10T22:00:00.000Z&dateTimeTo=2026-10-12T06:00:00.000Z`,
    );
    expect(calls.slice(1).sort()).toEqual([
      `${KINOGRAM_API}/movie/246706c7-1788-4e89-aa5d-aac31c3cf5f1`,
      `${KINOGRAM_API}/movie/be2bf01b-01e5-44af-9692-94e99801f061`,
      `${KINOGRAM_API}/movie/d076c6bb-6baf-4f83-a62c-34a322ddb863`,
    ]);
  });

  it("only answers for Warsaw", async () => {
    const calls: string[] = [];
    expect(await new KinogramProvider(liveFetch(calls), NOW).getShowtimes("Kraków", "2026-10-11")).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("fills in KinoGram next to the portal and the chains", async () => {
    const fetchFn = liveFetch();
    const l = createCinemaLogic({
      providers: [new CoigdzieProvider(fetchFn, NOW)],
      siteProviders: [new CinemaCityProvider(fetchFn, NOW), new HeliosProvider(fetchFn, NOW), new KinogramProvider(fetchFn, NOW)],
    });
    const lalka = await l.getShowtimes({ city: "Warszawa", date: "2026-10-11", movie: "lalka" });
    const perCinema = (name: string) => lalka.filter((s) => s.cinema === name).length;
    expect(perCinema("KinoGram")).toBe(7);
    expect(perCinema("Helios Blue City")).toBe(3); // Helios API (trimmed fixture) replaces the portal's 4
    expect(perCinema("Kino Muranów")).toBe(0);
    expect(perCinema("Kinoteka")).toBeGreaterThan(0); // portal only
  });
});
