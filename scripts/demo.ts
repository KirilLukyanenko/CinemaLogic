// Live lookup: npm run demo -- Warszawa 2026-10-06 [movie]
import { createCinemaLogic } from "../src";

const [city = "Warszawa", date = new Date().toISOString().slice(0, 10), movie] = process.argv.slice(2);
const logic = createCinemaLogic({ onError: (e, ctx) => console.error(`[${ctx.provider}]`, e) });

const movies = await logic.getMovies({ city, date, movie });
for (const m of movies) {
  console.log(`\n${m.title}${m.lengthMinutes ? ` (${m.lengthMinutes} min)` : ""}`);
  for (const s of m.showtimes) console.log(`  ${s.start.slice(11, 16)}  ${s.cinema}  ${s.format ?? ""}  ${s.bookingUrl ?? ""}`);
}
console.log(`\n${movies.length} movies in ${city} on ${date}`);
