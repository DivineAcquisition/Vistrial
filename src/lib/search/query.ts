/**
 * Exact search helpers. The database decides which rows exist for this person.
 * This file only ranks rows it was given, so a hidden record cannot change a count.
 */

export type SearchKind = "all" | "leads" | "tasks" | "team" | "pages" | "playbooks";

export type SearchRow = {
  kind: Exclude<SearchKind, "all">;
  id: string;
  title: string;
  detail: string;
  href: string;
};

const PHONE = /^[+\d\s().-]{6,}$/;

export function queryLooksLikePhone(query: string): boolean {
  const trimmed = query.trim();
  return PHONE.test(trimmed) && trimmed.replace(/\D/g, "").length >= 3;
}

export function phoneDigits(query: string): string {
  return query.replace(/\D/g, "");
}

export function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function rowMatches(row: SearchRow, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return false;
  if (queryLooksLikePhone(query)) {
    const digits = phoneDigits(query);
    const hay = phoneDigits(`${row.title} ${row.detail}`);
    return hay.includes(digits);
  }
  const hay = normalizeSearch(`${row.title} ${row.detail}`);
  return hay.includes(q);
}

export function filterSearch(rows: SearchRow[], query: string, kind: SearchKind): SearchRow[] {
  return rows.filter((row) => (kind === "all" || row.kind === kind) && rowMatches(row, query));
}

export const SEARCH_EMPTY = "Nothing matched. Try a name, a phone number, or a page.";
