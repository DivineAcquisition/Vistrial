/**
 * Logos for the platforms Vistrial researches, connects to, or may read results from.
 * Files live in `public/brand/platforms/`. Every mark belongs to its owner and is
 * shown only to say "works with" or "researches across". Read the brand's own
 * guidelines (`guidelines`) before changing a logo's colors, shape, or spacing.
 *
 * Where the files came from:
 * - Full color SVGs: svgl.app (MIT-licensed collection of brand-supplied logos).
 * - `mono/` SVGs: simple-icons 16.36.0 (CC0), with fill set to currentColor.
 * - HighLevel, Fathom, Fireflies: their own websites (svgl and simple-icons lack them). Their mono
 *   versions are made here: HighLevel recolored, Fathom and Fireflies cut from the icon's shape.
 * - Google Ads, HubSpot, Airtable color files: the simple-icons glyph in the brand's hex.
 */

export type PlatformGroup =
  /** Where Strategist researches. Matches `platform` in convex/lib/researchShapes.ts. */
  | "source"
  /** Connectors the product describes today. */
  | "connector"
  /** Candidates for reading a customer's own results. Not built. */
  | "results"
  /** The model provider behind the agents. */
  | "model";

export type Platform = {
  id: string;
  name: string;
  group: PlatformGroup;
  /** Full color mark, for light backgrounds. */
  color: string;
  /** Single-color mark that takes the surrounding text color. Null when no clean mono version exists. */
  mono: string | null;
  /** The brand's own usage rules, when it publishes them. */
  guidelines: string | null;
  note?: string;
};

const dir = "/brand/platforms";

export const PLATFORMS: readonly Platform[] = [
  // Research sources
  { id: "youtube", name: "YouTube", group: "source", color: `${dir}/youtube.svg`, mono: `${dir}/mono/youtube.svg`, guidelines: "https://brand.youtube" },
  {
    id: "meta",
    name: "Meta Ad Library",
    group: "source",
    color: `${dir}/meta.svg`,
    mono: `${dir}/mono/meta.svg`,
    guidelines: "https://about.meta.com/brand/resources/",
    note: "Meta owns the Ad Library and has no separate Ad Library logo, so use the Meta mark.",
  },
  {
    id: "tiktok",
    name: "TikTok",
    group: "source",
    color: `${dir}/tiktok.svg`,
    mono: `${dir}/mono/tiktok.svg`,
    guidelines: null,
  },
  { id: "instagram", name: "Instagram", group: "source", color: `${dir}/instagram.svg`, mono: `${dir}/mono/instagram.svg`, guidelines: "https://about.instagram.com/brand" },
  {
    id: "facebook",
    name: "Facebook",
    group: "source",
    color: `${dir}/facebook.svg`,
    mono: `${dir}/mono/facebook.svg`,
    guidelines: "https://about.meta.com/brand/resources/facebook/logo",
    note: "Not a research source today. Here in case Facebook pages or ads are named on their own.",
  },

  // Connectors
  {
    id: "gohighlevel",
    name: "HighLevel",
    group: "connector",
    color: `${dir}/gohighlevel.svg`,
    mono: `${dir}/mono/gohighlevel.svg`,
    guidelines: null,
    note: "The company now calls itself HighLevel. Wordmark for light pages: gohighlevel-wordmark.svg.",
  },
  { id: "google-calendar", name: "Google Calendar", group: "connector", color: `${dir}/google-calendar.svg`, mono: `${dir}/mono/google-calendar.svg`, guidelines: null },
  { id: "outlook", name: "Outlook Calendar", group: "connector", color: `${dir}/outlook.svg`, mono: null, guidelines: null },
  { id: "fathom", name: "Fathom", group: "connector", color: `${dir}/fathom.png`, mono: `${dir}/mono/fathom.png`, guidelines: null, note: "Fathom the call recorder (fathom.ai), not Fathom Analytics." },
  { id: "fireflies", name: "Fireflies", group: "connector", color: `${dir}/fireflies.png`, mono: `${dir}/mono/fireflies.png`, guidelines: null },
  { id: "google-drive", name: "Google Drive", group: "connector", color: `${dir}/google-drive.svg`, mono: `${dir}/mono/google-drive.svg`, guidelines: "https://developers.google.com/drive/web/branding" },
  { id: "hubspot", name: "HubSpot", group: "connector", color: `${dir}/hubspot.svg`, mono: `${dir}/mono/hubspot.svg`, guidelines: "https://www.hubspot.com/style-guide", note: "Not a live connector. Do not show it as working." },
  { id: "salesforce", name: "Salesforce", group: "connector", color: `${dir}/salesforce.svg`, mono: null, guidelines: "https://brand.salesforce.com/", note: "Not a live connector. Do not show it as working." },
  { id: "airtable", name: "Airtable", group: "connector", color: `${dir}/airtable.svg`, mono: `${dir}/mono/airtable.svg`, guidelines: null, note: "Not a live connector. Do not show it as working." },

  // Customer results (candidates)
  { id: "google-ads", name: "Google Ads", group: "results", color: `${dir}/google-ads.svg`, mono: `${dir}/mono/google-ads.svg`, guidelines: null },
  { id: "google-analytics", name: "Google Analytics", group: "results", color: `${dir}/google-analytics.svg`, mono: `${dir}/mono/google-analytics.svg`, guidelines: null },
  { id: "linkedin", name: "LinkedIn", group: "results", color: `${dir}/linkedin.svg`, mono: null, guidelines: "https://brand.linkedin.com/" },

  // Model provider
  { id: "claude", name: "Claude", group: "model", color: `${dir}/claude.svg`, mono: `${dir}/mono/claude.svg`, guidelines: null, note: "Check Anthropic's partner rules before using it as a \"powered by\" badge." },
  { id: "anthropic", name: "Anthropic", group: "model", color: `${dir}/anthropic.svg`, mono: `${dir}/mono/anthropic.svg`, guidelines: null },
];

export function platform(id: string): Platform | undefined {
  return PLATFORMS.find((entry) => entry.id === id);
}

export function platformsIn(group: PlatformGroup): Platform[] {
  return PLATFORMS.filter((entry) => entry.group === group);
}
