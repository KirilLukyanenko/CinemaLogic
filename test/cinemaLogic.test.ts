import { describe, expect, it } from "vitest";
import { CinemaCityProvider, createCinemaLogic, formatFromAttributes, WARSZAWA } from "../src";
import type { FetchLike } from "../src";
import { withZoneOffset } from "../src/util";
import { cinemasResponse, eventsByCinema } from "./fixtures/cinemaCity";

function fakeFetch(calls: string[] = [], failCinema?: string): FetchLike {
  return async (url) => {
    calls.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.includes("/cinemas/with-event/")) return json(cinemasResponse);
    const m = /in-cinema\/(\d+)\/at-date\/(\d{4}-\d{2}-\d{2})/.exec(url);
    if (m && m[1] === failCinema) return json({}, 500);
    if (m) return json(eventsByCinema[m[1]!] ?? { body: { films: [], events: [] } });
    return json({}, 404);
  };
}

const logic = (fetchFn: FetchLike, onError?: () => void) =>
  createCinemaLogic({ providers: [new CinemaCityProvider(fetchFn)], onError });

describe("getCinemas", () => {
  it("returns only cinemas in the city, ignoring case and diacritics", async () => {
    const cinemas = await logic(fakeFetch()).getCinemas("krakow");
    expect(cinemas.map((c) => c.name)).toEqual(["Cinema City Kraków Bonarka"]);
    expect(cinemas[0]).toMatchObject({ id: "cinema-city:1088", city: "Kraków" });
  });
});

describe("getCinemas for Warsaw", () => {
  it("lists every Warsaw cinema, small ones included, and accepts the English name", async () => {
    const cinemas = await logic(fakeFetch()).getCinemas("Warsaw");
    expect(cinemas).toHaveLength(WARSZAWA.length);
    expect(cinemas.find((c) => c.name === "Kino Muranów")).toMatchObject({ city: "Warszawa", hasShowtimes: false, district: "Śródmieście" });
  });

  it("merges chain cinemas from the provider with the static list", async () => {
    const cinemas = await logic(fakeFetch()).getCinemas("Warszawa");
    expect(cinemas.find((c) => c.name === "Cinema City Arkadia")).toMatchObject({ id: "cinema-city:1074", provider: "cinema-city", hasShowtimes: true, district: "Wola" });
    expect(cinemas.filter((c) => c.hasShowtimes).map((c) => c.name)).toEqual(["Cinema City Arkadia", "Cinema City Bemowo"]);
  });

  it("does not pair a venue on a partial word (ADA vs Arkadia)", async () => {
    const cinemas = await logic(fakeFetch()).getCinemas("Warszawa");
    expect(cinemas.find((c) => c.name === "ADA Kino Studyjne")?.hasShowtimes).toBe(false);
  });

  it("still lists the city when the provider is down", async () => {
    const down: FetchLike = async () => new Response("", { status: 503 });
    const cinemas = await logic(down).getCinemas("Warszawa");
    expect(cinemas).toHaveLength(WARSZAWA.length);
    expect(cinemas.every((c) => !c.hasShowtimes)).toBe(true);
  });
});

describe("getShowtimes", () => {
  it("returns every showtime in the city in the agreed shape, sorted by time", async () => {
    const showtimes = await logic(fakeFetch()).getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    expect(showtimes).toEqual([
      { cinema: "Cinema City Arkadia", city: "Warszawa", movie: "Robot", start: "2026-10-06T12:00:00+02:00", format: "2D, dubbing", bookingUrl: "https://www.cinema-city.pl/booking/112" },
      { cinema: "Cinema City Bemowo", city: "Warszawa", movie: "Diuna: Część druga", start: "2026-10-06T17:00:00+02:00", format: "3D, napisy", bookingUrl: "https://www.cinema-city.pl/booking/221" },
      { cinema: "Cinema City Arkadia", city: "Warszawa", movie: "Diuna: Część druga", start: "2026-10-06T19:30:00+02:00", format: "IMAX, napisy", bookingUrl: "https://www.cinema-city.pl/booking/111" },
    ]);
  });

  it("filters by movie title loosely", async () => {
    const showtimes = await logic(fakeFetch()).getShowtimes({ city: "warszawa", date: "2026-10-06", movie: "czesc DRUGA" });
    expect(showtimes.map((s) => s.cinema)).toEqual(["Cinema City Bemowo", "Cinema City Arkadia"]);
  });

  it("keeps results from other cinemas when one fails", async () => {
    const errors: unknown[] = [];
    const l = createCinemaLogic({ providers: [new CinemaCityProvider(fakeFetch([], "1070"))], onError: (e) => errors.push(e) });
    const showtimes = await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    expect(showtimes).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });

  it("rejects a malformed date", async () => {
    await expect(logic(fakeFetch()).getShowtimes({ city: "Warszawa", date: "6.10.2026" })).rejects.toThrow(/YYYY-MM-DD/);
  });

  it("caches the cinema list between calls", async () => {
    const calls: string[] = [];
    const l = logic(fakeFetch(calls));
    await l.getShowtimes({ city: "Warszawa", date: "2026-10-06" });
    await l.getShowtimes({ city: "Warszawa", date: "2026-10-07" });
    expect(calls.filter((u) => u.includes("/cinemas/with-event/"))).toHaveLength(1);
  });
});

describe("getMovies", () => {
  it("groups showtimes by movie with poster and length", async () => {
    const movies = await logic(fakeFetch()).getMovies({ city: "Warszawa", date: "2026-10-06" });
    expect(movies.map((m) => [m.title, m.showtimes.length, m.lengthMinutes])).toEqual([
      ["Diuna: Część druga", 2, 166],
      ["Robot", 1, 102],
    ]);
    expect(movies[0]!.posterUrl).toBe("https://example.test/dune.jpg");
  });
});

describe("helpers", () => {
  it("adds the Warsaw offset for summer and winter time", () => {
    expect(withZoneOffset("2026-07-01T20:00:00")).toBe("2026-07-01T20:00:00+02:00");
    expect(withZoneOffset("2026-12-01T20:00:00")).toBe("2026-12-01T20:00:00+01:00");
    expect(withZoneOffset("2026-10-25T01:30:00")).toBe("2026-10-25T01:30:00+02:00");
  });

  it("builds a readable format label", () => {
    expect(formatFromAttributes(["2d", "subbed"])).toBe("2D, napisy");
    expect(formatFromAttributes(["imax", "3d", "dubbed"])).toBe("IMAX 3D, dubbing");
    expect(formatFromAttributes([])).toBeUndefined();
  });
});
