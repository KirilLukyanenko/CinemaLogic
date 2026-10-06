// Trimmed real responses, saved 2026-10-06 (see README "Test fixtures").
import { readFileSync } from "node:fs";

export const live = (name: string): string => readFileSync(new URL(name, import.meta.url), "utf8");
export const liveJson = (name: string): unknown => JSON.parse(live(name));
