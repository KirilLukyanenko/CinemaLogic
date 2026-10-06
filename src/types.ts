/** One screening of a movie in a cinema. Shape agreed with the mobile app. */
export type Showtime = {
  cinema: string; // "Cinema City Arkadia"
  city: string; // "Warszawa"
  movie: string; // "Dune: Part Two"
  start: string; // ISO time with offset, e.g. "2026-10-06T19:30:00+02:00"
  format?: string; // "2D", "IMAX", "dubbing", "napisy"
  bookingUrl?: string;
};

export type Cinema = {
  /** Globally unique: "<provider>:<provider cinema id>". */
  id: string;
  provider: string;
  name: string;
  city: string;
  address?: string;
  url?: string;
};

/** A movie playing in the city on the chosen day, with every place and time to see it. */
export type Movie = {
  title: string;
  posterUrl?: string;
  lengthMinutes?: number;
  showtimes: Showtime[];
};

export type ShowtimeQuery = {
  city: string;
  date: string; // YYYY-MM-DD, local cinema date
  movie?: string; // case/diacritics-insensitive substring of the title
};

/** A cinema chain (or any schedule source). Add a new chain by implementing this. */
export interface CinemaProvider {
  readonly name: string;
  /** All cinemas of this provider in the city (matching is diacritics-insensitive). */
  listCinemas(city: string): Promise<Cinema[]>;
  /** Every showtime in one cinema on one local date. */
  getShowtimes(cinema: Cinema, date: string): Promise<ProviderShowtime[]>;
}

/** Showtime plus the extra movie details a provider may know. */
export type ProviderShowtime = Showtime & {
  posterUrl?: string;
  lengthMinutes?: number;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
