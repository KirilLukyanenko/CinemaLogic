import type { Venue } from "../types";

/**
 * Every cinema in Warsaw (city limits), chains and small/arthouse venues alike.
 * Compiled October 2026 from kino.coigdzie.pl, cinema websites and city guides;
 * open-air and one-off venues are left out. Sources name cinemas differently
 * ("Cinema City Warszawa Galeria Północna", "Kino Luna w Warszawie"), so `match`
 * lists the words that identify each one.
 */
export const WARSZAWA: Venue[] = [
  // Chains
  { name: "Cinema City Arkadia", chain: "cinema-city", match: ["arkadia"], address: "al. Jana Pawła II 82", district: "Wola" },
  { name: "Cinema City Bemowo", chain: "cinema-city", match: ["bemowo"], address: "ul. Powstańców Śląskich 126A", district: "Bemowo" },
  { name: "Cinema City Białołęka", chain: "cinema-city", match: ["bialoleka", "galeria polnocna"], address: "ul. Światowida 17 (Galeria Północna)", district: "Białołęka" },
  { name: "Cinema City Mokotów", chain: "cinema-city", match: ["mokotow"], address: "ul. Wołoska 12 (Galeria Mokotów)", district: "Mokotów" },
  { name: "Cinema City Promenada", chain: "cinema-city", match: ["promenada"], address: "ul. Ostrobramska 75C", district: "Praga-Południe" },
  // "Sadyba IMAX" is listed separately by some sources; it is the same cinema.
  { name: "Cinema City Sadyba", chain: "cinema-city", match: ["sadyba"], address: "ul. Powsińska 31", district: "Mokotów" },
  { name: "Multikino Złote Tarasy", chain: "multikino", match: ["zlote tarasy"], address: "ul. Złota 59", district: "Śródmieście", url: "https://www.multikino.pl/repertuar/warszawa-zlote-tarasy/teraz-gramy" },
  { name: "Multikino Targówek", chain: "multikino", match: ["targowek"], address: "ul. Głębocka 15 (G City)", district: "Targówek", url: "https://www.multikino.pl/repertuar/warszawa-g-city-targowek/teraz-gramy" },
  { name: "Multikino Wola Park", chain: "multikino", match: ["wola"], address: "ul. Górczewska 124", district: "Wola", url: "https://www.multikino.pl/repertuar/warszawa-wola-park/teraz-gramy" },
  { name: "Multikino Reduta", chain: "multikino", match: ["reduta"], address: "Al. Jerozolimskie 148 (Atrium Reduta)", district: "Ochota" },
  { name: "Multikino Młociny", chain: "multikino", match: ["mlociny"], address: "ul. Zgrupowania AK \"Kampinos\" 15", district: "Bielany" },
  { name: "Helios Blue City", chain: "helios", match: ["blue city"], address: "Al. Jerozolimskie 179", district: "Ochota" },

  // Independent, arthouse and cultural-centre cinemas
  { name: "Kinoteka", match: ["kinoteka"], address: "pl. Defilad 1 (Pałac Kultury i Nauki)", district: "Śródmieście", url: "https://kinoteka.pl/" },
  { name: "Kino Muranów", match: ["muranow"], address: "ul. Gen. Andersa 5", district: "Śródmieście", url: "https://kinomuranow.pl/" },
  { name: "Kino Luna", match: ["kino luna"], address: "ul. Marszałkowska 28", district: "Śródmieście", url: "https://kinoluna.waw.pl/" },
  { name: "Kino Atlantic", match: ["atlantic"], address: "ul. Chmielna 33", district: "Śródmieście" },
  { name: "Kino Kultura", match: ["kino kultura"], address: "ul. Krakowskie Przedmieście 21/23", district: "Śródmieście" },
  { name: "Kino Amondo", match: ["amondo"], address: "ul. Żurawia 20", district: "Śródmieście" },
  { name: "KinoGram", match: ["kinogram"], address: "ul. Żelazna 51/53", district: "Wola", url: "https://kinogram.pl/" },
  { name: "Kino Iluzjon", match: ["iluzjon"], address: "ul. Narbutta 50a", district: "Mokotów" },
  { name: "U-jazdowski Kino", match: ["u jazdowski", "ujazdowski"], address: "ul. Jazdów 2", district: "Śródmieście" },
  { name: "Kino Elektronik", match: ["elektronik"], address: "ul. Gen. Zajączka 7", district: "Żoliborz" },
  { name: "Nove Kino Wisła", match: ["wisla"], address: "pl. Wilsona 2", district: "Żoliborz" },
  { name: "Kino Praha", match: ["kino praha"], address: "ul. Jagiellońska 26", district: "Praga-Północ" },
  { name: "Kino Świt", match: ["kino swit"], address: "ul. Wysockiego 11", district: "Targówek" },
  { name: "Kino Kadr", match: ["kadr"], address: "ul. Rożana 22/24 (Dom Kultury Kadr)", district: "Mokotów" },
  { name: "ADA Kino Studyjne", match: ["ada"], address: "ul. Ks. Juliana Chrościckiego 14", district: "Ursus" },
  { name: "Dom Sztuki", match: ["dom sztuki"], address: "ul. Puszczyka 17", district: "Ursynów" },
  { name: "Kino Na Boku", match: ["na boku"], address: "ul. Żegańska 1a", district: "Wawer" },
  { name: "Kinokawiarnia Stacja Falenica", match: ["falenica"], address: "ul. Patriotów 44B", district: "Wawer" },
];
