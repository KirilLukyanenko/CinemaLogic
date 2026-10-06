/** One screening of a movie in a cinema. Shape agreed with the mobile app. */
export type Showtime = {
  cinema: string; // "Cinema City Arkadia"
  city: string; // "Warszawa"
  movie: string; // "Dune: Part Two"
  start: string; // ISO time with offset, e.g. "2026-10-06T19:30:00+02:00"
  format?: string; // "2D", "IMAX 3D", "dubbing", "3D, napisy"
  bookingUrl?: string;
};

export type Cinema = {
  /** Stable slug of the cinema name, e.g. "kino-muranow". */
  id: string;
  name: string;
  city: string;
  address?: string;
  district?: string;
  url?: string;
};

/** A movie playing in the city on the chosen day, with every place and time to see it. */
export type Movie = {
  title: string;
  year?: string;
  genre?: string;
  posterUrl?: string;
  lengthMinutes?: number;
  showtimes: Showtime[];
};

export type ShowtimeQuery = {
  city: string;
  date: string; // YYYY-MM-DD, local cinema date
  movie?: string; // case/diacritics-insensitive substring of the title
};

/** A cinema from a city's static list (see src/cities). */
export type Venue = {
  name: string;
  chain?: "cinema-city" | "multikino" | "helios";
  /**
   * Lowercase, diacritics-free word sequences; a source's cinema name containing
   * any of them (and the chain name, for chain venues) is this venue.
   */
  match: string[];
  address: string;
  district?: string;
  url?: string;
};

/** A cinema as a source names it, before it is paired with a venue. */
export type SourceCinema = {
  name: string;
  url?: string;
  address?: string;
};

/** Showtime plus extra movie details a source may know. */
export type SourceShowtime = Showtime & {
  cinemaUrl?: string;
  year?: string;
  genre?: string;
  posterUrl?: string;
  lengthMinutes?: number;
};

/** A schedule source for whole cities. Add a new source by implementing this. */
export interface CinemaProvider {
  readonly name: string;
  /** Every showtime in the city on one local date. */
  getShowtimes(city: string, date: string): Promise<SourceShowtime[]>;
  /** Cinemas this source knows in the city. */
  listCinemas(city: string): Promise<SourceCinema[]>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
