/**
 * What a site capture found, field by field, each with where it came from. Pure, so the server, the
 * onboarding screens and Settings share one shape and one set of words.
 *
 * A field is never filled by a guess: a value either has a source on the site (or in a connected account, or
 * a person typed it), or the field is "missing" and says so.
 */

export const ORIGINS = ["site", "person", "connected", "missing"] as const;
export type Origin = (typeof ORIGINS)[number];

/** How a value was found on the site. */
export const HOWS = ["structured data", "meta tag", "stylesheet", "page text", "link", "image"] as const;
export type How = (typeof HOWS)[number];

export type FieldSource = {
  /** The page it was read on: its address, and its id in the capture's page list. */
  url: string;
  pageId: string | null;
  how: How;
  /** The site's own words, exactly, when the value rests on words. */
  quote?: string;
};

/**
 * - stated: the site says it (a price, a guarantee, a colour in its stylesheet).
 * - reading: Vistrial's reading of what the site says (tone of voice). Shown as a reading, never as a fact.
 */
export type Basis = "stated" | "reading";

export type Field<T> = {
  value: T | null;
  origin: Origin;
  basis: Basis;
  sources: FieldSource[];
};

export type Quoted = { text: string; pageId: string; quote: string };
export type CapturedOffer = { name: string; price: string; included: string[]; guarantee: string; terms: string; pageId: string; quote: string };
export type CapturedColor = { hex: string; label: string };
export type CapturedLogo = { url: string; storageId: string | null; from: string };

/** Every page the capture read or found, with what it is for. */
export const PAGE_KINDS = ["home", "sales", "landing", "booking", "optin", "pricing", "services", "results", "about", "contact", "other"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export const PAGE_KIND_WORDS: Record<PageKind, string> = {
  home: "Home page",
  sales: "Sales page",
  landing: "Landing page",
  booking: "Booking page",
  optin: "Opt-in page",
  pricing: "Pricing page",
  services: "Services page",
  results: "Results and testimonials",
  about: "About page",
  contact: "Contact page",
  other: "Other page",
};

export type CapturedPage = {
  id: string;
  url: string;
  kind: PageKind;
  title: string;
  /** Read by Vistrial, or only found: a booking page on another site is recorded, never read. */
  read: boolean;
  /** The reader's reason in words when it could not be read. */
  reason: string | null;
};

export type CaptureResult = {
  name: Field<string>;
  logo: Field<CapturedLogo>;
  colors: Field<CapturedColor[]>;
  headingFont: Field<string>;
  bodyFont: Field<string>;
  tone: Field<{ text: string; quotes: string[] }>;
  audience: Field<string>;
  location: Field<string>;
  offers: Field<CapturedOffer[]>;
  proof: Field<Quoted[]>;
  guarantees: Field<Quoted[]>;
  social: Field<{ host: string; url: string }[]>;
  pages: CapturedPage[];
  /** Items the model gave whose quote is not on the page. Dropped; kept as a count for us, never shown as found. */
  dropped: number;
};

export const FIELD_KEYS = ["name", "logo", "colors", "headingFont", "bodyFont", "tone", "audience", "location", "offers", "proof", "guarantees", "social"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const FIELD_WORDS: Record<FieldKey, { label: string; missing: string }> = {
  name: { label: "Business name", missing: "No business name found on your site" },
  logo: { label: "Logo", missing: "No logo found on your site" },
  colors: { label: "Brand colours", missing: "No brand colours found on your site" },
  headingFont: { label: "Heading font", missing: "No heading font found" },
  bodyFont: { label: "Body font", missing: "No body font found" },
  tone: { label: "Tone of voice", missing: "Not enough words on your site to read a tone" },
  audience: { label: "Who you serve", missing: "Your site does not say who you serve" },
  location: { label: "Location", missing: "No location stated on your site" },
  offers: { label: "Offers and prices", missing: "No offers or prices stated on your site" },
  proof: { label: "Proof", missing: "No testimonials or results found on your site" },
  guarantees: { label: "Guarantees", missing: "No guarantee stated on your site" },
  social: { label: "Social links", missing: "No social links found on your site" },
};

export function missing<T>(): Field<T> {
  return { value: null, origin: "missing", basis: "stated", sources: [] };
}

export function found<T>(value: T, sources: FieldSource[], basis: Basis = "stated"): Field<T> {
  const empty = value === null || value === "" || (Array.isArray(value) && value.length === 0);
  return empty ? missing<T>() : { value, origin: "site", basis, sources };
}

export function emptyResult(): CaptureResult {
  return {
    name: missing(),
    logo: missing(),
    colors: missing(),
    headingFont: missing(),
    bodyFont: missing(),
    tone: missing(),
    audience: missing(),
    location: missing(),
    offers: missing(),
    proof: missing(),
    guarantees: missing(),
    social: missing(),
    pages: [],
    dropped: 0,
  };
}

/** The label a screen shows for where a field came from. */
export function originWords(field: Pick<Field<unknown>, "origin" | "basis" | "sources">, pages: Pick<CapturedPage, "id" | "kind">[] = []): string {
  if (field.origin === "missing") return "Not on your site";
  if (field.origin === "person") return "You set this";
  if (field.origin === "connected") return "From a connected account";
  if (field.basis === "reading") return "Vistrial's reading of your site";
  const first = field.sources[0];
  const page = first?.pageId ? pages.find((row) => row.id === first.pageId) : null;
  return page ? `From your site · ${PAGE_KIND_WORDS[page.kind]}` : "From your site";
}

/** Parses a stored result. A row that does not parse reads as nothing found, never as a crash. */
export function parseResult(raw: string | undefined | null): CaptureResult | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CaptureResult;
    return value && typeof value === "object" && Array.isArray(value.pages) ? value : null;
  } catch {
    return null;
  }
}
