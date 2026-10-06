import { describe, expect, it } from "vitest";
import { CinemaCityProvider, CoigdzieProvider, createCinemaLogic, formatFromAttributes, HeliosProvider, MultikinoProvider, splitTitle, WARSZAWA } from "../src";
import { multikinoFilms } from "./fixtures/chains";
import { live, liveJson } from "./fixtures/live";
import type { FetchLike } from "../src";
import { withZoneOffset } from "../src/util";
import { cinemasResponse, eventsByCinema } from "./fixtures/cinemaCity";
import { coigdzieWarszawaPage } from "./fixtures/coigdzieWarszawa";

const NOW = () => new Date("2026-10-06T10:00:00+02:00");
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeFetch(opts: { calls?: string[]; coigdzieDown?: boolean } = {}): FetchLike {
  return async (url) => {
    opts.calls?.push(url);
    if (url.startsWith("https://kino.coigdzie.pl/")) {
      if (opts.coigdzieDown) return new Response("", { status: 500 });
      return url.endsWith("/miasto/warszawa/dzien/wtorek")
        ? new Response(coigdzieWarszawaPage, { status: 200 })
        : new Response("<html><body></body></html>", { status: 200 });
    }
    if (url.includes("/cinemas/with-event/")) return json(cinemasResponse);
    const m = /in-cinema\/(\d+)\/at-date\//.exec(url);
    if (m) return json(eventsByCinema[m[1]!] ?? { body: { films: [], events: [] } });
    return json({}, 404);
  };
}

const logic = (fetchFn: FetchLike, onError?: (e: unknown, ctx: { provider: string }) => void) =>
  createCinemaLogic({ providers: [new CoigdzieProvider(fetchFn, NOW)], siteProviders: [], onError });

describe("getShowtimes from kino.coigdzie.pl", () => {
  it("returns every cinema's showtimes, small ones included, in the agreed shape", async () => {
    const showtimes = await logic(fakeFetch()).getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    expect(showtimes).toEqual([
      { cinema: "Cinema City Białołęka", city: "Warszawa", movie: "Lalka", start: "2026-10-06T12:30:00+02:00", bookingUrl: "https://www.cinema-city.pl/b/1" },
      { cinema: "Kino Nowe Na Mapie", city: "Warszawa", movie: "Avengers: Koniec gry - wersja rozszerzona", start: "2026-10-06T16:00:00+02:00", bookingUrl: "https://kino.coigdzie.pl/kino/kino-nowe-na-mapie-w-warszawie-1" },
      { cinema: "Multikino Reduta", city: "Warszawa", movie: "Avengers: Koniec gry - wersja rozszerzona", start: "2026-10-06T17:15:00+02:00", bookingUrl: "https://multikino.pl/b/4" },
      { cinema: "Kino Muranów", city: "Warszawa", movie: "Lalka", start: "2026-10-06T18:00:00+02:00", bookingUrl: "https://bilety.kinomuranow.pl/1" },
      { cinema: "Kinokawiarnia Stacja Falenica", city: "Warszawa", movie: "Lalka", start: "2026-10-06T19:00:00+02:00", bookingUrl: "https://kino.coigdzie.pl/kino/kinokawiarnia-stacja-falenica-w-warszawie-8961" },
      { cinema: "Cinema City Sadyba", city: "Warszawa", movie: "Avengers: Koniec gry - wersja rozszerzona", start: "2026-10-06T20:00:00+02:00", format: "3D, dubbing", bookingUrl: "https://www.cinema-city.pl/b/3" },
    ]);
  });

  it("filters by movie title loosely and accepts the English city name", async () => {
    const showtimes = await logic(fakeFetch()).getShowtimes({ city: "Warsaw", date: "2026-10-06", movie: "LALKA" });
    expect(showtimes.map((s) => s.cinema)).toEqual(["Cinema City Białołęka", "Kino Muranów", "Kinokawiarnia Stacja Falenica"]);
  });

  it("groups 2D/3D/dubbed versions into one movie with year and genre", async () => {
    const movies = await logic(fakeFetch()).getMovies({ city: "Warszawa", date: "2026-10-06" });
    expect(movies.map((m) => [m.title, m.showtimes.length, m.year, m.genre])).toEqual([
      ["Avengers: Koniec gry - wersja rozszerzona", 3, "2019", "akcja"],
      ["Lalka", 3, "2026", "dramat"],
    ]);
  });

  it("rejects a malformed date", async () => {
    await expect(logic(fakeFetch()).getShowtimes({ city: "Warszawa", date: "6.10.2026" })).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("fetches the page once for cinemas and showtimes of the same day", async () => {
    const calls: string[] = [];
    const l = logic(fakeFetch({ calls }));
    await l.getCinemas("Warszawa");
    await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    expect(calls.filter((u) => u.includes("coigdzie"))).toHaveLength(1);
  });
});

describe("chain APIs", () => {
  const chainsFetch = (calls: string[] = []): FetchLike => {
    const base = fakeFetch({ calls });
    return async (url, init) => {
      calls.push(url);
      if (url.endsWith("/auth/token")) return new Response("{}", { status: 200, headers: { "Set-Cookie": "session=abc; Path=/; HttpOnly" } });
      if (url.includes("multikino.pl/api/microservice/showings/")) {
        return new Headers(init?.headers).get("Cookie") === "session=abc" ? json(multikinoFilms) : json({}, 401);
      }
      if (url === "https://api.helios.pl/api/v1/cinemas/26/screenings") return json(liveJson("helios-26-screenings.json"));
      return base(url, init);
    };
  };
  const reduta = WARSZAWA.find((v) => v.name === "Multikino Reduta")!;
  const chains = (fetchFn: FetchLike) => [
    new CinemaCityProvider(fetchFn, NOW),
    new MultikinoProvider(fetchFn, [{ ...reduta, multikinoId: "0099" }]),
    new HeliosProvider(fetchFn, NOW),
  ];

  it("read Multikino with a session cookie and Helios from one schedule request", async () => {
    const calls: string[] = [];
    const fetchFn = chainsFetch(calls);
    const l = createCinemaLogic({ providers: [new CoigdzieProvider(fetchFn, NOW)], siteProviders: chains(fetchFn) });
    const lalka = await l.getShowtimes({ city: "Warszawa", date: "2026-10-11", movie: "lalka" });
    expect(lalka.map((s) => [s.cinema, s.start.slice(11, 16)])).toEqual([
      ["Helios Blue City", "11:00"],
      ["Multikino Reduta", "11:00"],
      ["Helios Blue City", "14:30"],
      ["Helios Blue City", "18:00"],
      ["Multikino Reduta", "20:10"],
    ]);
    expect(lalka[1]).toEqual({ cinema: "Multikino Reduta", city: "Warszawa", movie: "Lalka", start: "2026-10-11T11:00:00+02:00", bookingUrl: "https://www.multikino.pl/rezerwacja-biletow/podsumowanie/0099/HO00002549/1" });
    const toy = await l.getShowtimes({ city: "Warszawa", date: "2026-10-11", movie: "toy story" });
    expect(toy[0]).toMatchObject({ movie: "Toy Story 5", format: "dubbing", bookingUrl: "https://www.multikino.pl/filmy/toy-story-5" });
    expect(calls.filter((u) => u.startsWith("https://api.helios.pl/"))).toHaveLength(1);
  });

  it("replace the portal's data for the chain cinemas they cover", async () => {
    const fetchFn = chainsFetch();
    const l = createCinemaLogic({ providers: [new CoigdzieProvider(fetchFn, NOW)], siteProviders: chains(fetchFn) });
    const showtimes = await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    // Portal had Reduta at 17:15; Multikino's own API has nothing that day, so the portal stays.
    expect(showtimes.filter((s) => s.cinema === "Multikino Reduta").map((s) => s.start)).toEqual(["2026-10-06T17:15:00+02:00"]);
    // Cinema City's API covers Arkadia and Bemowo; the portal's other Cinema City cinemas stay.
    expect([...new Set(showtimes.map((s) => s.cinema))].sort()).toEqual([
      "Cinema City Arkadia", "Cinema City Bemowo", "Cinema City Białołęka", "Cinema City Sadyba",
      "Kino Muranów", "Kino Nowe Na Mapie", "Kinokawiarnia Stacja Falenica", "Multikino Reduta",
    ]);
  });

  it("keep the chains working when the portal is down", async () => {
    const errors: string[] = [];
    const fetchFn = fakeFetch({ coigdzieDown: true });
    const l = createCinemaLogic({ providers: [new CoigdzieProvider(fetchFn, NOW)], siteProviders: [new CinemaCityProvider(fetchFn, NOW)], onError: (_, c) => errors.push(c.provider) });
    const showtimes = await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    expect(errors).toEqual(["coigdzie"]);
    expect(showtimes.map((s) => [s.cinema, s.movie, s.format])).toEqual([
      ["Cinema City Arkadia", "Robot", "2D, dubbing"],
      ["Cinema City Bemowo", "Diuna: Część druga", "3D, napisy"],
      ["Cinema City Arkadia", "Diuna: Część druga", "IMAX, napisy"],
    ]);
  });

  it("treats an empty portal page as a failure", async () => {
    const errors: string[] = [];
    const showtimes = await logic(fakeFetch(), (_, ctx) => errors.push(ctx.provider)).getShowtimes({ city: "Warszawa", date: "2026-10-09" });
    expect(errors).toEqual(["coigdzie"]);
    expect(showtimes).toEqual([]);
  });
});

describe("cinema website parsers", () => {
  const site = (showtimes: { cinema: string; movie: string; start: string }[]) => ({
    name: "site",
    listCinemas: async () => [],
    getShowtimes: async (city: string) => showtimes.map((s) => ({ ...s, city })),
  });

  it("replace the portal's showtimes for their cinema and keep everything else", async () => {
    const fetchFn = fakeFetch();
    const l = createCinemaLogic({
      providers: [new CoigdzieProvider(fetchFn, NOW)],
      siteProviders: [site([{ cinema: "Kino Muranów", movie: "Lalka", start: "2026-10-06T21:00:00+02:00" }])],
    });
    const muranow = (await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" })).filter((s) => s.cinema === "Kino Muranów");
    expect(muranow.map((s) => s.start)).toEqual(["2026-10-06T21:00:00+02:00"]);
    expect(await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" })).toHaveLength(6);
  });

  it("a failing site parser leaves the portal's data in place", async () => {
    const errors: string[] = [];
    const broken = { name: "broken", listCinemas: async () => [], getShowtimes: async () => Promise.reject(new Error("layout changed")) };
    const l = createCinemaLogic({ providers: [new CoigdzieProvider(fakeFetch(), NOW)], siteProviders: [broken], onError: (_, c) => errors.push(c.provider) });
    expect(await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" })).toHaveLength(6);
    expect(errors).toEqual(["broken"]);
  });

  it("pairs the portal's spellings of small cinemas with the Warsaw list", async () => {
    const names = ["U–jazdowski kino", "Kino Domu Sztuki", "KinoGram", "Kinomuzeum w Muzeum Sztuki Nowoczesnej", "Kino Kępa - Prom Kultury Saska Kępa"];
    const l = createCinemaLogic({
      siteProviders: [],
      providers: [site(names.map((cinema) => ({ cinema, movie: "Film", start: "2026-10-06T18:00:00+02:00" })))],
    });
    const cinemas = (await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" })).map((s) => s.cinema);
    expect(cinemas.sort()).toEqual(["Dom Sztuki", "Kino Kępa", "KinoGram", "Kinomuzeum", "U-jazdowski Kino"]);
  });
});

describe("getMovies", () => {
  it("groups titles that differ only in punctuation", async () => {
    const site = (cinema: string, movie: string) => ({
      name: cinema,
      listCinemas: async () => [],
      getShowtimes: async (city: string) => [{ cinema, city, movie, start: "2026-10-11T18:00:00+02:00" }],
    });
    const l = createCinemaLogic({
      providers: [],
      siteProviders: [site("Kinoteka", "The Social Reckoning: W sieci konsekwencji"), site("Cinema City Arkadia", "The Social Reckoning. W sieci konsekwencji")],
    });
    const movies = await l.getMovies({ city: "Warszawa", date: "2026-10-11" });
    expect(movies.map((m) => m.showtimes.map((s) => s.cinema))).toEqual([["Cinema City Arkadia", "Kinoteka"]]);
  });
});

describe("getCinemas", () => {
  it("lists every Warsaw cinema plus ones the portal knows that the list misses", async () => {
    const cinemas = await logic(fakeFetch()).getCinemas("Warszawa");
    expect(cinemas).toHaveLength(WARSZAWA.length + 1);
    expect(cinemas.find((c) => c.name === "Kino Muranów")).toMatchObject({ id: "kino-muranow", district: "Śródmieście" });
    expect(cinemas.find((c) => c.name === "Kino Nowe Na Mapie")).toMatchObject({ city: "Warszawa", url: "https://kino.coigdzie.pl/kino/kino-nowe-na-mapie-w-warszawie-1" });
  });

  it("still lists the city when every source is down", async () => {
    const down: FetchLike = async () => new Response("", { status: 503 });
    expect(await logic(down).getCinemas("Warszawa")).toHaveLength(WARSZAWA.length);
  });

  it("does not pair a venue on a partial word (ADA vs Arkadia)", async () => {
    const fetchFn = fakeFetch({ coigdzieDown: true });
    const cinemas = await createCinemaLogic({ providers: [new CoigdzieProvider(fetchFn, NOW), new CinemaCityProvider(fetchFn, NOW)], siteProviders: [] }).getCinemas("Warszawa");
    expect(cinemas.find((c) => c.name === "Cinema City Arkadia")?.url).toBe("https://www.cinema-city.pl/kina/arkadia/1074");
    expect(cinemas.find((c) => c.name === "ADA Kino Studyjne")?.url).toBeUndefined();
  });
});

describe("helpers", () => {
  it("splits version markers off the title", () => {
    expect(splitTitle("Avengers: Koniec gry 3D (dubbing) - wersja rozszerzona")).toEqual({ title: "Avengers: Koniec gry - wersja rozszerzona", format: "3D, dubbing" });
    expect(splitTitle("Afrykanska przygoda 3D IMAX (napisy)")).toEqual({ title: "Afrykanska przygoda", format: "IMAX 3D, napisy" });
    expect(splitTitle("Resident Evil: Oselia Zla (ukr.)")).toEqual({ title: "Resident Evil: Oselia Zla", format: "ukr." });
    expect(splitTitle("Toy Story 5")).toEqual({ title: "Toy Story 5", format: undefined });
    expect(splitTitle("Lalka (seans z audiodeskrypcją)")).toEqual({ title: "Lalka", format: "audiodeskrypcja" });
  });

  it("adds the Warsaw offset for summer and winter time", () => {
    expect(withZoneOffset("2026-07-01T20:00:00")).toBe("2026-07-01T20:00:00+02:00");
    expect(withZoneOffset("2026-12-01T20:00:00")).toBe("2026-12-01T20:00:00+01:00");
    expect(withZoneOffset("2026-10-25T01:30:00")).toBe("2026-10-25T01:30:00+02:00");
  });

  it("builds a readable format label from Cinema City attributes", () => {
    expect(formatFromAttributes(["2d", "subbed"])).toBe("2D, napisy");
    expect(formatFromAttributes(["imax", "3d", "dubbed"])).toBe("IMAX 3D, dubbing");
    expect(formatFromAttributes([])).toBeUndefined();
  });
});
