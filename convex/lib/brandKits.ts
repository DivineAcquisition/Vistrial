/**
 * Brand kit content: cleaned, checked and compared in code. Pure, so the server and the screen share it.
 * A workspace has one kit for its own brand (the agency, consultant or coach) and one per client. Every
 * creative belongs to one kit, and the look of a creative always comes from its kit, never from a reference ad.
 */

export const BRAND_KINDS = ["own", "client"] as const;
export type BrandKind = (typeof BRAND_KINDS)[number];
export const BRAND_KIND_WORDS: Record<BrandKind, string> = { own: "Your brand", client: "Client" };

export const LOGO_VARIANTS = ["light", "dark", "icon"] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];
export const LOGO_VARIANT_WORDS: Record<LogoVariant, string> = { light: "For light backgrounds", dark: "For dark backgrounds", icon: "Icon" };

/** Industries where ad claims are held to stricter rules. A creative for one gets extra claim checks. */
export const REGULATED = ["none", "health", "finance", "other"] as const;
export type Regulated = (typeof REGULATED)[number];
export const REGULATED_WORDS: Record<Regulated, string> = { none: "Not regulated", health: "Health or wellness", finance: "Money, income or investing", other: "Other regulated field" };

export const PLACEMENTS = ["1:1", "4:5", "9:16", "16:9", "1.91:1"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const PLACEMENT_WORDS: Record<Placement, string> = { "1:1": "Square feed", "4:5": "Portrait feed", "9:16": "Stories and Reels", "16:9": "Landscape video", "1.91:1": "Link ad" };

export type BrandColor = { label: string; hex: string };
export type BrandLogo = { storageId: string; variant: LogoVariant; name: string };
/** An ad this brand has already run, kept as a picture of its look for the image model to follow. */
export type BrandStyleRef = { storageId: string; name: string };

export type BrandContent = {
  name: string;
  website: string;
  industry: string;
  colors: BrandColor[];
  headingFont: string;
  bodyFont: string;
  imageStyle: string;
  tone: string;
  useWords: string[];
  avoidWords: string[];
  examples: string[];
  disclaimers: string[];
  regulated: Regulated;
  bannedTopics: string[];
  placements: Placement[];
  logos: BrandLogo[];
  /** The person confirmed the business owns these logos or may use them. Required once a logo is added. */
  logosOwned: boolean;
  /** Ads this brand has run itself. A designed ad follows their look. Never a competitor's ad. */
  styleRefs: BrandStyleRef[];
  /** The person confirmed these are the brand's own ads. Required once one is added. */
  styleRefsOwned: boolean;
};

export const EMPTY_BRAND: BrandContent = {
  name: "",
  website: "",
  industry: "",
  colors: [],
  headingFont: "",
  bodyFont: "",
  imageStyle: "",
  tone: "",
  useWords: [],
  avoidWords: [],
  examples: [],
  disclaimers: [],
  regulated: "none",
  bannedTopics: [],
  placements: [],
  logos: [],
  logosOwned: false,
  styleRefs: [],
  styleRefsOwned: false,
};

export const BRAND_MAX = {
  name: 80,
  website: 200,
  industry: 80,
  colors: 8,
  colorLabel: 30,
  font: 60,
  imageStyle: 600,
  tone: 600,
  words: 20,
  word: 40,
  examples: 5,
  example: 600,
  disclaimers: 5,
  disclaimer: 300,
  bannedTopics: 10,
  bannedTopic: 80,
  logos: 6,
  logoName: 120,
  styleRefs: 4,
  note: 200,
} as const;

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export const STYLE_REF_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const STYLE_REFS_OWNED_WORDS = "These are ads this brand made and ran itself, not another business's.";

/** What a caller may send: anything missing is read as blank. */
export type BrandInput = Partial<Omit<BrandContent, "regulated" | "placements" | "logos" | "styleRefs">> & {
  regulated?: string;
  placements?: string[];
  logos?: { storageId: string; variant: string; name: string }[];
  styleRefs?: { storageId: string; name: string }[];
};

const HEX = /^#[0-9a-f]{6}$/;

function text(value: string | undefined, max: number) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Trimmed, blanks and repeats dropped (compared without case), cut to the list's size. */
function list(values: string[] | undefined, maxItems: number, maxLength: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const value = text(raw, maxLength);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, maxItems);
}

/** "#ABC", "abc" and "#aabbcc" all read as "#aabbcc". Anything else is returned as typed, for brandProblem to name. */
export function normalHex(raw: string) {
  const value = raw.trim().toLowerCase().replace(/^#?/, "#");
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  return value;
}

/** What is wrong with a kit, in words a person can act on. Null when it can be saved. */
export function brandProblem(input: BrandInput): string | null {
  if (!text(input.name, BRAND_MAX.name)) return "Give the brand a name.";
  if ((input.colors ?? []).length > BRAND_MAX.colors) return `Keep to ${BRAND_MAX.colors} colours.`;
  for (const color of input.colors ?? []) {
    if (!HEX.test(normalHex(color.hex))) return `"${color.hex.trim() || "A blank colour"}" is not a colour code. Use six characters, like #1A2B3C.`;
  }
  const website = text(input.website, BRAND_MAX.website);
  if (website && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(website)) return "Write the website as a full link, starting with https://.";
  if (input.regulated !== undefined && !(REGULATED as readonly string[]).includes(input.regulated)) return "Choose whether this brand is in a regulated field.";
  for (const placement of input.placements ?? []) {
    if (!(PLACEMENTS as readonly string[]).includes(placement)) return "One of the placements is not one Vistrial makes.";
  }
  const logos = input.logos ?? [];
  if (logos.length > BRAND_MAX.logos) return `Keep to ${BRAND_MAX.logos} logo files.`;
  for (const logo of logos) {
    if (!(LOGO_VARIANTS as readonly string[]).includes(logo.variant)) return "Say what each logo is for: light backgrounds, dark backgrounds or an icon.";
  }
  if (logos.length > 0 && input.logosOwned !== true) return "Confirm that this business owns these logos or may use them.";
  const refs = input.styleRefs ?? [];
  if (refs.length > BRAND_MAX.styleRefs) return `Keep to ${BRAND_MAX.styleRefs} example ads.`;
  if (refs.length > 0 && input.styleRefsOwned !== true) return "Confirm that the example ads are this brand's own. Another business's ad cannot be a style example.";
  return null;
}

/** The kit as it is stored: trimmed, cut to size, colours as lower-case hex. Call after brandProblem. */
export function cleanBrand(input: BrandInput): BrandContent {
  const seenColors = new Set<string>();
  const colors: BrandColor[] = [];
  for (const color of input.colors ?? []) {
    const hex = normalHex(color.hex);
    if (!HEX.test(hex) || seenColors.has(hex)) continue;
    seenColors.add(hex);
    colors.push({ label: text(color.label, BRAND_MAX.colorLabel), hex });
  }
  const seenLogos = new Set<string>();
  const logos: BrandLogo[] = [];
  for (const logo of input.logos ?? []) {
    if (seenLogos.has(logo.storageId) || !(LOGO_VARIANTS as readonly string[]).includes(logo.variant)) continue;
    seenLogos.add(logo.storageId);
    logos.push({ storageId: logo.storageId, variant: logo.variant as LogoVariant, name: text(logo.name.replace(/[^\w .()-]+/g, ""), BRAND_MAX.logoName) || "logo" });
  }
  const seenRefs = new Set<string>();
  const styleRefs: BrandStyleRef[] = [];
  for (const ref of input.styleRefs ?? []) {
    if (seenRefs.has(ref.storageId)) continue;
    seenRefs.add(ref.storageId);
    styleRefs.push({ storageId: ref.storageId, name: text(ref.name.replace(/[^\w .()-]+/g, ""), BRAND_MAX.logoName) || "ad" });
  }
  return {
    name: text(input.name, BRAND_MAX.name),
    website: text(input.website, BRAND_MAX.website),
    industry: text(input.industry, BRAND_MAX.industry),
    colors: colors.slice(0, BRAND_MAX.colors),
    headingFont: text(input.headingFont, BRAND_MAX.font),
    bodyFont: text(input.bodyFont, BRAND_MAX.font),
    imageStyle: text(input.imageStyle, BRAND_MAX.imageStyle),
    tone: text(input.tone, BRAND_MAX.tone),
    useWords: list(input.useWords, BRAND_MAX.words, BRAND_MAX.word),
    avoidWords: list(input.avoidWords, BRAND_MAX.words, BRAND_MAX.word),
    examples: list(input.examples, BRAND_MAX.examples, BRAND_MAX.example),
    disclaimers: list(input.disclaimers, BRAND_MAX.disclaimers, BRAND_MAX.disclaimer),
    regulated: (REGULATED as readonly string[]).includes(input.regulated ?? "") ? (input.regulated as Regulated) : "none",
    bannedTopics: list(input.bannedTopics, BRAND_MAX.bannedTopics, BRAND_MAX.bannedTopic),
    placements: PLACEMENTS.filter((placement) => (input.placements ?? []).includes(placement)),
    logos: logos.slice(0, BRAND_MAX.logos),
    logosOwned: logos.length > 0 && input.logosOwned === true,
    styleRefs: styleRefs.slice(0, BRAND_MAX.styleRefs),
    styleRefsOwned: styleRefs.length > 0 && input.styleRefsOwned === true,
  };
}

export function sameBrand(a: BrandContent, b: BrandContent) {
  return JSON.stringify(cleanBrand(a)) === JSON.stringify(cleanBrand(b));
}

/**
 * How ready a kit is for Creative Production, as the parts still missing. A creative can be made without
 * all of them, but each one missing means the result leans on defaults instead of the brand.
 */
export function brandGaps(kit: BrandContent): string[] {
  const gaps: string[] = [];
  if (kit.logos.length === 0) gaps.push("a logo file");
  if (kit.colors.length === 0) gaps.push("brand colours");
  if (!kit.tone) gaps.push("a tone of voice");
  if (kit.placements.length === 0) gaps.push("the placements you run");
  return gaps;
}
