import type { FetchLike } from "./types";

const UA = "Mozilla/5.0 (compatible; CinemaLogic/0.1; +low-volume showtime lookup)";

/** GET a JSON document with a timeout. Throws on non-2xx or network errors. */
export async function getJson<T>(fetchFn: FetchLike, url: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
