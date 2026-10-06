// Saves cinema websites' schedule pages into test/fixtures/sites/ so parsers can be
// written and tested against real markup.
//   npm run snapshot                 # all sites below
//   npm run snapshot -- kinogram     # one site
//   npm run snapshot -- ada https://example.pl/repertuar   # extra URL for a site
import { mkdir, writeFile } from "node:fs/promises";

const SITES: Record<string, string[]> = {
  kinogram: ["https://kinogram.pl/", "https://kinogram.pl/repertuar/", "https://bilety.kinogram.pl/"],
  ujazdowski: ["https://u-jazdowski.pl/kino/repertuar", "https://u-jazdowski.pl/en/kino/repertuar"],
  // ADA Kino Studyjne is run by Dom Kultury Włochy.
  ada: ["https://dkwlochy.pl/", "https://pik.warszawa.pl/miejsca/kino-studyjne-ada-dom-kultury-wlochy/"],
  // Dom Sztuki sells tickets through ebilet.pl.
  domsztuki: ["https://www.ebilet.pl/miejsce/dom-sztuki"],
};

const [only, ...extra] = process.argv.slice(2);
const targets = only ? { [only]: [...(SITES[only] ?? []), ...extra] } : SITES;

for (const [site, urls] of Object.entries(targets)) {
  const dir = new URL(`../test/fixtures/sites/${site}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "pl-PL,pl;q=0.9" } });
      if (!res.ok) {
        console.error(`HTTP ${res.status} ${url} (not saved)`);
        continue;
      }
      const file = new URL(`${url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_")}.html`, dir);
      await writeFile(file, await res.text());
      console.log(`${res.status} ${url} -> ${file.pathname}`);
    } catch (error) {
      console.error(`FAIL ${url}: ${error}`);
    }
  }
}
