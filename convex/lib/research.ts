/** Sources a research project can ask for. "customer" data is uploaded, never searched, so it is not here. */
export const RESEARCH_PLATFORMS = ["web", "youtube", "tiktok", "instagram", "metaAdLibrary"] as const;

export type ResearchPlatform = (typeof RESEARCH_PLATFORMS)[number];

export type SourcePlatform = ResearchPlatform | "customer";

export const EXCERPT_MAX = 300;

export const LIMITS = {
  title: 120,
  objective: 2000,
  market: 300,
  geography: 200,
  competitors: 20,
  competitorName: 120,
  url: 2048,
  collectionName: 80,
  note: 500,
};

/** Query parameters that only track a click. They never change what a page shows. */
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|si|ref_src|_hsenc|_hsmi)$/i;

/**
 * The form of a URL used to spot the same page twice: https or http only, lowercase host without
 * "www.", no fragment, no tracking parameters, remaining parameters sorted, no trailing slash.
 * Returns null for anything that is not a plain web link.
 */
export function canonicalUrl(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > LIMITS.url) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;
  const params = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING.test(key))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const path = url.pathname.replace(/\/+$/, "");
  const port = url.port ? `:${url.port}` : "";
  return `https://${host}${port}${path}${query}`;
}

/** Excerpts are short and attributed. Longer text is cut at a word, never kept whole. */
export function trimExcerpt(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return undefined;
  if (clean.length <= EXCERPT_MAX) return clean;
  const cut = clean.slice(0, EXCERPT_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > EXCERPT_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function requireText(value: string, max: number, what: string): string {
  const clean = value.trim();
  if (clean.length === 0) throw new Error(`Add ${what}.`);
  if (clean.length > max) throw new Error(`Keep ${what} under ${max} characters.`);
  return clean;
}

export function optionalText(value: string | undefined, max: number, what: string): string {
  const clean = (value ?? "").trim();
  if (clean.length > max) throw new Error(`Keep ${what} under ${max} characters.`);
  return clean;
}
