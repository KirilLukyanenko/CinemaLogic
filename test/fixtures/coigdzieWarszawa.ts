// Trimmed kino.coigdzie.pl city/day page (same markup as the live site).
const show = (time: string, href?: string) => {
  const badge = `<span class=" badge badge-light" data-time="${time}">${time.slice(11, 16)}&nbsp;<span class="badge badge-ticket">bilet</span></span>`;
  return href ? `<a href="${href}" target="_blank">${badge}</a>` : badge;
};
const cinema = (name: string, href: string, shows: string[]) => `
      <div class="cinema row">
        <div class="col"><a href="${href}" class="cinemaname">${name}</a></div>
        <div class="col"><span class="shows">${shows.join("\n")}</span></div>
      </div>`;

export const coigdzieWarszawaPage = `<!DOCTYPE html>
<html lang="pl"><body>
<div class="cig_kino_movies">
  <div class="first movie">
    <div class="row"><div class="col-9 col-md-9 list">
      <a href="/film/lalka-1400001" class="title">Lalka</a>
      <p class="info">2026 | Polska | dramat</p>
      ${cinema("Kino Muranów w Warszawie", "/kino/kino-muranow-w-warszawie-8359", [
        show("2026-10-06 18:00:00", "https://bilety.kinomuranow.pl/1"),
      ])}
      ${cinema("Cinema City Warszawa Galeria Północna", "/kino/cinema-city-warszawa-galeria-polnocna-109315", [
        show("2026-10-06 12:30:00", "https://www.cinema-city.pl/b/1"),
        show("2026-10-07 00:15:00", "https://www.cinema-city.pl/b/2"),
      ])}
      ${cinema("Kinokawiarnia Stacja Falenica w Warszawie", "/kino/kinokawiarnia-stacja-falenica-w-warszawie-8961", [
        show("2026-10-06 19:00:00"),
      ])}
    </div></div>
  </div>
  <div class="movie">
    <div class="row"><div class="col-9 col-md-9 list">
      <h2>Avengers: Koniec gry 3D (dubbing) - wersja rozszerzona</h2>
      <p class="info">2019 | USA | akcja</p>
      ${cinema("Cinema City Warszawa Sadyba IMAX", "/kino/cinema-city-warszawa-sadyba-imax-95713", [
        show("2026-10-06 20:00:00", "https://www.cinema-city.pl/b/3"),
      ])}
    </div></div>
  </div>
  <div class="movie">
    <div class="row"><div class="col-9 col-md-9 list">
      <a href="/film/avengers-1400002" class="title">Avengers: Koniec gry - wersja rozszerzona</a>
      ${cinema("Multikino Atrium Reduta w Warszawie", "/kino/multikino-atrium-reduta-w-warszawie-133696", [
        show("2026-10-06 17:15:00", "https://multikino.pl/b/4"),
      ])}
      ${cinema("Kino Nowe Na Mapie w Warszawie", "/kino/kino-nowe-na-mapie-w-warszawie-1", [
        show("2026-10-06 16:00:00"),
      ])}
    </div></div>
  </div>
</div>
</body></html>`;
