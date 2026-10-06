// Copy to the app as app/api/cinema+api.ts (Expo Router API route).
// GET /api/cinema?city=Warszawa&date=2026-10-06[&movie=Diuna][&view=movies|showtimes|cinemas|sources]
// view=sources shows what each source (Cinema City, KinoGram, the portal, ...) returned, or its error.
import { getCinemas, getMovies, getShowtimes, getSourceReport } from "cinema-logic"; // or a relative path to src/index.ts

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const city = params.get("city");
  const date = params.get("date") ?? new Date().toISOString().slice(0, 10);
  const movie = params.get("movie") ?? undefined;
  const view = params.get("view") ?? "movies";
  if (!city) return Response.json({ error: "city is required" }, { status: 400 });

  try {
    if (view === "cinemas") return Response.json(await getCinemas(city));
    if (view === "sources") return Response.json(await getSourceReport({ city, date }));
    if (view === "showtimes") return Response.json(await getShowtimes({ city, date, movie }));
    return Response.json(await getMovies({ city, date, movie }));
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
}
