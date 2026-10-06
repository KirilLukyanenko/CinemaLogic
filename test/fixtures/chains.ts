// Response shape of the Multikino showings API (written from real responses; not yet
// replaced by a saved live response because multikino.pl answered 403 to our requests).
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
