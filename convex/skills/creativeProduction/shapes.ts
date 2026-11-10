import type { BrandContent } from "../../lib/brandKits";
import type { OfferContent } from "../../lib/offerCards";

export const SKILL_SLUG = "creative-production";

export const PHASE = {
  context: "cpContext",
  write: "cpWrite",
  check: "cpCheck",
  revise: "cpRevise",
  recheck: "cpRecheck",
  save: "cpSave",
} as const;

/**
 * How closely a creative follows its reference. Every setting copies structure only: the wording, the look,
 * the footage, the faces, the voice, the music and the logos of the reference are never reused. The dial
 * changes how many structural elements are kept.
 */
export const DIALS = ["inspired", "structure", "close"] as const;
export type Dial = (typeof DIALS)[number];
export const DIAL_WORDS: Record<Dial, { label: string; keeps: string }> = {
  inspired: { label: "Inspired by", keeps: "Keeps the kind of hook and the format. Everything else is new." },
  structure: { label: "Same structure", keeps: "Keeps the kind of hook, the format, the kind of offer and where the call to action sits." },
  close: { label: "Close match", keeps: "Keeps the kind of hook, the format, the kind of offer, the order of the beats and where the call to action sits." },
};
export const DIAL_RULES: Record<Dial, string> = {
  inspired: "Keep only the reference's hook type and format. Choose a different order of beats, offer framing and call-to-action placement that suit this business.",
  structure: "Keep the reference's hook type, format, offer type and call-to-action placement. The beats in between may differ.",
  close: "Keep the reference's hook type, format, offer type, order of beats and call-to-action placement, beat for beat.",
};

/** The most a creative may share with its reference's words, at every dial setting. */
export const MAX_SHARED_RUN = 5;
export const MAX_SHARED_SHARE = 0.05;

export const VARIATIONS = 4;
export const VARIATION_KEYS = ["A", "B", "C", "D"] as const;

/** Length limits per field, in characters. Ad platforms cut longer text off. */
export const COPY_MAX = { hook: 140, headline: 60, primaryText: 700, cta: 30, caption: 400 } as const;

export type RequestStart = { kind: "source"; sourceRefId: string } | { kind: "offer"; offerCardId: string };

/** The reference ad, as research already recorded it. Its text is data to compare against, never to reuse. */
export type ReferenceView = {
  sourceRefId: string;
  platform: string;
  kind: string;
  title: string;
  publisher: string | null;
  url: string;
  excerpt: string | null;
  /** The earlier classification: a model's reading of the ad's structure, not a fact about it. */
  structure: { hook: string | null; offer: string | null; callToAction: string | null; format: string | null; audience: string | null };
};

export type FactLite = { id: string; factKey: string; value: string; status: string };

export type CreativeContext = {
  requestId: string;
  dial: Dial;
  note: string;
  kit: { id: string; kind: "own" | "client"; version: number; content: BrandContent };
  reference: ReferenceView | null;
  offer: { cardId: string; version: number; content: OfferContent } | null;
  profile: { versionId: string; offer: string; audience: string; brandVoice: string; competitors: string[] } | null;
  /** Facts a person verified. An ad may state only these, the offer card and the brand kit as fact. */
  facts: FactLite[];
  /** What the business tried before and what happened, in words. */
  outcomes: string[];
  /** Names the copy must not use: competitors on record and the reference's advertiser. */
  blockedNames: string[];
};

export type Variation = {
  key: string;
  hookType: string;
  hook: string;
  primaryText: string;
  headline: string;
  cta: string;
  /** What the image should show, for the image step. Never a logo: the real logo file is placed on top. */
  imageDirection: string;
  /** What this variation tests against the others. Untested until the business runs it. */
  hypothesis: string;
};

export type CopyClaim = {
  /** The factual statement as it appears in the copy. */
  text: string;
  /** What backs it: a verified fact, or the offer card the creative is made for. */
  support: "fact" | "offer";
  factIds: string[];
};

export type CreativeSet = {
  summary: string;
  /** The structure taken from the reference, in the creative's own words. Null fields when there is no reference. */
  structure: { hookType: string; format: string; beats: string[]; offerType: string; ctaPlacement: string };
  brief: { audience: string; promise: string; angle: string; tone: string };
  variations: Variation[];
  script: { beats: { seconds: string; voiceover: string; onScreen: string }[] };
  captions: string[];
  claims: CopyClaim[];
  limits: string[];
  contextUsed: { profileVersionId: string | null; factIds: string[] };
};

export type CheckResult = { id: number; name: string; passed: boolean; detail: string };
export type ChecksRecord = { passed: boolean; results: CheckResult[] };

/** What the save step records for screens: the creative as data, with the brand and reference it was made for. */
export type CreativeRecord = {
  creative: CreativeSet | null;
  checks: ChecksRecord;
  versions: number;
  dial: Dial;
  kit: { id: string; name: string; kind: "own" | "client"; version: number };
  reference: { sourceRefId: string; title: string; url: string; platform: string; publisher: string | null } | null;
  offer: { cardId: string; name: string; version: number } | null;
  disclaimers: string[];
};

const str = { type: "string" } as const;
const strs = { type: "array", items: str } as const;
const object = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false }) as const;

export const CREATIVE_SCHEMA = object({
  summary: str,
  structure: object({ hookType: str, format: str, beats: strs, offerType: str, ctaPlacement: str }),
  brief: object({ audience: str, promise: str, angle: str, tone: str }),
  variations: {
    type: "array",
    items: object({ key: str, hookType: str, hook: str, primaryText: str, headline: str, cta: str, imageDirection: str, hypothesis: str }),
  },
  script: object({ beats: { type: "array", items: object({ seconds: str, voiceover: str, onScreen: str }) } }),
  captions: strs,
  claims: { type: "array", items: object({ text: str, support: { type: "string", enum: ["fact", "offer"] }, factIds: strs }) },
  limits: strs,
  contextUsed: object({ profileVersionId: { type: ["string", "null"] }, factIds: strs }),
});

function text(value: unknown, max = 2000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function list(value: unknown, max = 20, length = 600): string[] {
  return Array.isArray(value) ? value.map((row) => text(row, length)).filter(Boolean).slice(0, max) : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rows(value: unknown, max: number): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, max).map(obj) : [];
}

/** A model's answer read into the shape the checks and screens use. Null when it is not an object at all. */
export function readCreative(value: unknown): CreativeSet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = obj(value);
  const structure = obj(row.structure);
  const brief = obj(row.brief);
  const used = obj(row.contextUsed);
  return {
    summary: text(row.summary, 1500),
    structure: { hookType: text(structure.hookType, 200), format: text(structure.format, 200), beats: list(structure.beats, 12, 300), offerType: text(structure.offerType, 200), ctaPlacement: text(structure.ctaPlacement, 200) },
    brief: { audience: text(brief.audience, 600), promise: text(brief.promise, 600), angle: text(brief.angle, 600), tone: text(brief.tone, 600) },
    variations: rows(row.variations, 8).map((item, index) => ({
      key: text(item.key, 4) || (VARIATION_KEYS[index] ?? String(index + 1)),
      hookType: text(item.hookType, 120),
      hook: text(item.hook, 400),
      primaryText: text(item.primaryText, 2000),
      headline: text(item.headline, 200),
      cta: text(item.cta, 80),
      imageDirection: text(item.imageDirection, 800),
      hypothesis: text(item.hypothesis, 400),
    })),
    script: { beats: rows(obj(row.script).beats, 12).map((item) => ({ seconds: text(item.seconds, 20), voiceover: text(item.voiceover, 500), onScreen: text(item.onScreen, 200) })) },
    captions: list(row.captions, 5, 800),
    claims: rows(row.claims, 20).map((item) => ({ text: text(item.text, 400), support: item.support === "offer" ? ("offer" as const) : ("fact" as const), factIds: list(item.factIds, 10, 80) })),
    limits: list(row.limits, 8, 400),
    contextUsed: { profileVersionId: text(used.profileVersionId, 80) || null, factIds: list(used.factIds, 40, 80) },
  };
}

/** Every word of copy a person would see in a variation. */
export function variationCopy(row: Variation) {
  return [row.hook, row.primaryText, row.headline, row.cta].filter(Boolean).join(". ");
}

/** All the copy of a creative: the variations, the script and the captions. */
export function allCopy(creative: CreativeSet) {
  return [...creative.variations.map(variationCopy), ...creative.script.beats.flatMap((beat) => [beat.voiceover, beat.onScreen]), ...creative.captions].filter(Boolean).join(". ");
}

/** The reference's own words: what the creative's wording is compared against. */
export function referenceText(reference: ReferenceView | null) {
  if (!reference) return "";
  return [reference.title, reference.excerpt, reference.structure.hook, reference.structure.offer, reference.structure.callToAction].filter(Boolean).join(". ");
}
