import type { Venue } from "../types";
import { normalize } from "../util";
import { WARSZAWA } from "./warszawa";

type CityList = { name: string; venues: Venue[] };

const CITIES: Record<string, CityList> = {
  warszawa: { name: "Warszawa", venues: WARSZAWA },
};
const ALIASES: Record<string, string> = { warsaw: "warszawa", warschau: "warszawa", varsovie: "warszawa" };

/** The static cinema list for a city, if we have one. */
export function cityList(city: string): CityList | undefined {
  const key = normalize(city);
  return CITIES[ALIASES[key] ?? key];
}

/** Provider city name for a user-typed city ("Warsaw" -> "Warszawa"). */
export function canonicalCity(city: string): string {
  return cityList(city)?.name ?? city;
}
