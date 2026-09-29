import { AppError } from "./errors";

const OKINA_AND_APOSTROPHES = /[ʻʼ‘’'`]/g;

/**
 * Folds text the same way the database `app_normalize` function does:
 * strips ʻokina and apostrophes, removes diacritics such as kahakō, lowercases.
 */
export function normalizeForSearch(input: string): string {
  return input
    .replace(OKINA_AND_APOSTROPHES, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** URL slug: ASCII, diacritics and ʻokina removed. "ʻŌlelo Hawaiʻi" -> "olelo-hawaii". */
export function slugify(input: string): string {
  const s = normalizeForSearch(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || "item";
}

/** Builds a prefix-matching tsquery string from free text, or null when nothing searchable remains. */
export function buildTsQuery(input: string): string | null {
  const terms = normalizeForSearch(input)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(" & ");
}

export function requireText(value: unknown, label: string, min: number, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length < min) throw new AppError("invalid", `${label} must be at least ${min} characters`);
  if (s.length > max) throw new AppError("invalid", `${label} must be at most ${max} characters`);
  return s;
}
