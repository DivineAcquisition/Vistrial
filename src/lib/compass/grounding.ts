/**
 * Every figure in an answer must come from a lookup. This finds the numbers in
 * the answer and checks each against the numbers the lookups returned (and the
 * person's own question). Anything left over is reported, and the answer is
 * shown with a plain note that part of it could not be verified.
 */

const DATE_LIKE = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?(,\s*\d{4})?\b/gi,
  /\b\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b(\s+\d{4})?/gi,
  /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/gi,
  /\b\d{1,2}:\d{2}\b/g,
  /\b(19|20)\d{2}\b/g,
];

/** Numbers as written in prose: 1,240 / 42% / 3.5 / $1,200.50. */
const NUMBER = /\$?\d[\d,]*(\.\d+)?%?/g;

function normalize(raw: string): number | null {
  const value = Number(raw.replace(/[$,%]/g, ""));
  return Number.isFinite(value) ? value : null;
}

function stripDates(text: string): string {
  let out = text;
  for (const pattern of DATE_LIKE) out = out.replace(pattern, " ");
  // Numbered list markers at the start of a line.
  out = out.replace(/^\s*\d+[.)]\s/gm, " ");
  // Markdown link targets and ids are not figures.
  out = out.replace(/\]\([^)]*\)/g, "]");
  out = out.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ");
  return out;
}

export function numbersIn(text: string): Array<{ raw: string; value: number }> {
  const found: Array<{ raw: string; value: number }> = [];
  for (const match of stripDates(text).matchAll(NUMBER)) {
    const value = normalize(match[0]);
    if (value !== null) found.push({ raw: match[0], value });
  }
  return found;
}

/** Every number anywhere in the lookup outputs, including numbers written inside strings. */
export function collectNumbers(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(value);
  } else if (typeof value === "string") {
    for (const item of numbersIn(value)) into.add(item.value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, into);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectNumbers(item, into);
  }
  return into;
}

/** The forms a looked-up number may reasonably take in prose. */
function variants(value: number): number[] {
  const out = [value, Math.round(value), Math.round(value * 10) / 10, Math.round(value * 100) / 100];
  if (Math.abs(value) <= 1) out.push(Math.round(value * 100), Math.round(value * 1000) / 10);
  // Seconds and cents read as minutes, hours, days and dollars.
  out.push(Math.round(value / 60), Math.round(value / 3600), Math.round((value / 3600) * 10) / 10, Math.round(value / 86400));
  out.push(Math.round(value / 100), Math.round(value) / 100);
  return out;
}

export function verifyNumbers(answer: string, lookups: unknown[], question = ""): { unverified: string[] } {
  const allowed = new Set<number>();
  for (const output of lookups) {
    for (const value of collectNumbers(output)) for (const form of variants(value)) allowed.add(form);
  }
  for (const item of numbersIn(question)) allowed.add(item.value);
  const unverified: string[] = [];
  for (const item of numbersIn(answer)) {
    // Single digits written as figures ("1 lead") are checked too, except zero and one,
    // which prose uses freely ("one of them", "0 waiting" comes from a lookup anyway).
    if (item.value === 0 || item.value === 1) continue;
    if (!allowed.has(item.value) && !unverified.includes(item.raw)) unverified.push(item.raw);
  }
  return { unverified };
}
