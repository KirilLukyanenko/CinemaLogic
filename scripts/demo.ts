// Live lookup: npm run demo -- Warszawa 2026-10-06 [movie]
// Prints every movie with its showtimes, then what each source returned.
import { createCinemaLogic, defaultProviders, defaultSiteProviders } from "../src";
import type { FetchLike } from "../src";

const [city = "Warszawa", date = new Date().toISOString().slice(0, 10), movie] = process.argv.slice(2);

// Each URL is fetched once, even though the summary below asks every source again.
const seen = new Map<string, Promise<{ status: number; headers: Headers; body: string }>>();
const memoFetch: FetchLike = async (url, init) => {
  if (init?.method && init.method !== "GET") return fetch(url, init);
  let hit = seen.get(url);
  if (!hit) {
    hit = fetch(url, init).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.text() }));
    seen.set(url, hit);
  }
  const r = await hit;
  return new Response(r.body, { status: r.status, headers: r.headers });
};

const providers = defaultProviders(memoFetch);
const siteProviders = defaultSiteProviders(memoFetch);
const logic = createCinemaLogic({ providers, siteProviders, onError: (e, ctx) => console.error(`[${ctx.provider}]`, e instanceof Error ? e.message : e) });

const movies = await logic.getMovies({ city, date, movie });
for (const m of movies) {
  console.log(`\n${m.title}${m.lengthMinutes ? ` (${m.lengthMinutes} min)` : ""}`);
  for (const s of m.showtimes) console.log(`  ${s.start.slice(11, 16)}  ${s.cinema}  ${s.format ?? ""}  ${s.bookingUrl ?? ""}`);
}
const total = movies.reduce((n, m) => n + m.showtimes.length, 0);
console.log(`\n${movies.length} movies, ${total} screenings in ${city} on ${date}`);

console.log("\nPer source (before merging):");
for (const p of [...siteProviders, ...providers]) {
  try {
    const showtimes = await p.getShowtimes(city, date);
    const titles = new Set(showtimes.map((s) => s.movie));
    console.log(`  ${p.name.padEnd(12)} ${String(titles.size).padStart(3)} movies ${String(showtimes.length).padStart(4)} screenings`);
  } catch (e) {
    console.log(`  ${p.name.padEnd(12)} failed: ${e instanceof Error ? e.message : e}`);
  }
}

const final = await logic.getShowtimes({ city, date, movie });
const direct = createCinemaLogic({ providers: [], siteProviders, onError: () => {} });
const directCinemas = new Set((await direct.getShowtimes({ city, date, movie })).map((s) => s.cinema));
const counts = new Map<string, number>();
for (const s of final) counts.set(s.cinema, (counts.get(s.cinema) ?? 0) + 1);
console.log("\nPer cinema in the result:");
for (const [cinema, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0], "pl"))) {
  console.log(`  ${cinema.padEnd(36)} ${String(n).padStart(4)}  ${directCinemas.has(cinema) ? "direct" : "portal"}`);
}
