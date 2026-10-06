// Response shapes of the Multikino and Helios APIs (from real responses, trimmed).
export const multikinoFilms = {
  result: [
    {
      filmId: "HO00002549",
      filmTitle: "Lalka",
      filmUrl: "https://www.multikino.pl/filmy/lalka",
      showingGroups: [
        {
          date: "2026-10-11T00:00:00",
          sessions: [
            { sessionId: "1", bookingUrl: "/rezerwacja-biletow/podsumowanie/0099/HO00002549/1", startTime: "2026-10-11T11:00:00" },
            { sessionId: "2", bookingUrl: "/rezerwacja-biletow/podsumowanie/0099/HO00002549/2", startTime: "2026-10-11T20:10:00" },
          ],
        },
      ],
    },
    { filmId: "HO00002550", filmTitle: "Toy Story 5 (dubbing)", filmUrl: "https://www.multikino.pl/filmy/toy-story-5", showingGroups: [{ sessions: [{ startTime: "2026-10-11T10:00:00" }] }] },
    { filmId: "HO00002551", filmTitle: "Bez seansów", showingGroups: [] },
  ],
};

export const heliosScreenings = {
  status: 200,
  data: {
    movies: {
      m4349: { id: 4349, title: "Lalka", titleOriginal: "Lalka", slug: "lalka" },
      m4466: { id: 4466, title: "Sprawiedliwość owiec", slug: "sprawiedliwosc-owiec" },
    },
    screenings: {
      "2026-10-11": {
        m4349: { screenings: [{ timeFrom: "2026-10-11 18:30:00", sourceId: "s-1", cinemaSourceId: "c-1" }] },
        m4466: { screenings: [{ timeFrom: "2026-10-11 16:00:00", sourceId: "s-2", cinemaSourceId: "c-1" }] },
      },
      "2026-10-12": { m4349: { screenings: [{ timeFrom: "2026-10-12 18:00:00", sourceId: "s-3", cinemaSourceId: "c-1" }] } },
    },
  },
};
