/** Lowercase, strip Polish/other diacritics and collapse spaces, for loose matching. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "l")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
}

/**
 * Turns a local wall-clock time ("2026-10-06T19:30:00") in `timeZone` into an ISO
 * string with that zone's offset ("2026-10-06T19:30:00+02:00"). Uses only Intl, so
 * it works in Node, Cloudflare workers and React Native (Hermes).
 */
export function withZoneOffset(local: string, timeZone = "Europe/Warsaw"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) return local;
  const [, y, mo, d, h, mi, s = "00"] = m;
  const asUtc = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s);
  // The zone's offset at (approximately) that instant; refine once to handle DST edges.
  let offset = zoneOffsetMinutes(asUtc, timeZone);
  offset = zoneOffsetMinutes(asUtc - offset * 60_000, timeZone);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${hh}:${mm}`;
}

function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((wall - utcMs) / 60_000);
}

/** True when `fragment` appears in `text` as whole words, e.g. "ada" in "ADA Kino" but not in "Arkadia". */
export function containsWords(text: string, fragment: string): boolean {
  const words = (t: string) => ` ${normalize(t).replace(/[^a-z0-9]+/g, " ").trim()} `;
  return words(text).includes(words(fragment));
}
