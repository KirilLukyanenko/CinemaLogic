// Trimmed responses in the shape returned by cinema-city.pl's quickbook service.
export const cinemasResponse = {
  body: {
    cinemas: [
      { id: "1074", displayName: "Arkadia", link: "https://www.cinema-city.pl/kina/arkadia/1074", addressInfo: { address1: "Al. Jana Pawła II 82", city: "Warszawa" } },
      { id: "1070", displayName: "Bemowo", link: "https://www.cinema-city.pl/kina/bemowo/1070", addressInfo: { address1: "ul. Powstańców Śląskich 126", city: "Warszawa" } },
      { id: "1088", displayName: "Kraków Bonarka", link: "https://www.cinema-city.pl/kina/bonarka/1088", addressInfo: { address1: "ul. Kamieńskiego 11", city: "Kraków" } },
    ],
  },
};

export const eventsByCinema: Record<string, unknown> = {
  "1074": {
    body: {
      films: [
        { id: "7001s2r", name: "Diuna: Część druga", length: 166, posterLink: "https://example.test/dune.jpg", link: "https://www.cinema-city.pl/filmy/diuna/7001s2r" },
        { id: "8002s2r", name: "Robot", length: 102, posterLink: "https://example.test/robot.jpg" },
      ],
      events: [
        { id: "111", filmId: "7001s2r", eventDateTime: "2026-10-06T19:30:00", attributeIds: ["imax", "2d", "subbed"], bookingLink: "https://www.cinema-city.pl/booking/111" },
        { id: "112", filmId: "8002s2r", eventDateTime: "2026-10-06T12:00:00", attributeIds: ["2d", "dubbed"], bookingLink: "https://www.cinema-city.pl/booking/112" },
      ],
    },
  },
  "1070": {
    body: {
      films: [{ id: "7001s2r", name: "Diuna: Część druga", length: 166 }],
      events: [
        { id: "221", filmId: "7001s2r", eventDateTime: "2026-10-06T17:00:00", attributeIds: ["3d", "subbed"], bookingLink: "https://www.cinema-city.pl/booking/221" },
      ],
    },
  },
};
