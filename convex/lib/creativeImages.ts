/**
 * Images for an ad set: what is asked of the image model, and what it costs. Pure, so the server and the
 * screen share it. The picture is always made without text and without a logo. The headline, the button and
 * the brand's real logo file are placed on top in code, so the words are exact and the logo is the real one.
 */

import { PLACEMENTS, type BrandContent, type Placement } from "./brandKits";
import type { ImageAspect, ImageSize } from "./gemini";
import { words } from "./similarity";

export const IMAGE_SIZE: ImageSize = "2K";
export const MAX_IMAGES_PER_BATCH = 12;
export const MAX_IMAGES_PER_DAY = 60;
/**
 * What reading a designed ad's words back is charged at, in cents of cost, whatever the read really cost: a
 * flat half cent, so the price a person confirms is exactly the price they pay.
 */
export const CHECK_COST_CENTS = 0.5;

/** The aspect ratio asked of the model for each placement. A link ad is cut from a 16:9 picture. */
export const PLACEMENT_ASPECT: Record<Placement, ImageAspect> = { "1:1": "1:1", "4:5": "4:5", "9:16": "9:16", "16:9": "16:9", "1.91:1": "16:9" };

export function isPlacement(value: string): value is Placement {
  return (PLACEMENTS as readonly string[]).includes(value);
}

/** Where the headline sits, so the picture can leave that area calm. */
const HEADLINE_AREA: Record<Placement, string> = {
  "1:1": "the lower third",
  "4:5": "the lower third",
  "9:16": "the lower third, above the bottom edge",
  "16:9": "the left half",
  "1.91:1": "the left half",
};

/**
 * The prompt for one image. Built in code from the variation's image direction and the brand kit only: the
 * reference ad is never part of it, so nothing of its look can be reproduced.
 */
export function imagePrompt(args: { direction: string; kit: Pick<BrandContent, "imageStyle" | "colors" | "industry">; placement: Placement }) {
  const { direction, kit, placement } = args;
  return [
    "A photographic background image for an advertisement.",
    `Scene: ${direction}`,
    kit.imageStyle ? `Style: ${kit.imageStyle}` : "Style: clean, natural light, uncluttered.",
    kit.colors.length ? `Colour accents, used sparingly: ${kit.colors.map((row) => row.hex).join(", ")}.` : "",
    kit.industry ? `The business is in: ${kit.industry}.` : "",
    `Keep ${HEADLINE_AREA[placement]} calm and uncluttered: a headline is placed there afterwards.`,
    "Rules: no text, letters, numbers, captions or signage anywhere in the image. No logos, brand marks or watermarks. No real or recognisable people, and no celebrities; if a person appears, show them from behind or out of focus. No trademarked products or packaging.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * How an ad's picture is made. "designed": the whole ad, words included, is drawn by the image model and
 * then read back to check every word. "photo": a picture with no words, with the headline, the button and
 * the real logo file placed on top in code.
 */
export const LOOKS = ["designed", "photo"] as const;
export type Look = (typeof LOOKS)[number];
export const LOOK_WORDS: Record<Look, { label: string; what: string }> = {
  designed: { label: "Designed ad", what: "The whole ad is drawn with your words in it, then read back to check every word." },
  photo: { label: "Photo with text on top", what: "A picture with no words. Your headline, button and real logo file are placed on top." },
};
export const TONES = ["dark", "light"] as const;
export type Tone = (typeof TONES)[number];

export function isLook(value: string): value is Look {
  return (LOOKS as readonly string[]).includes(value);
}
export function isTone(value: string): value is Tone {
  return (TONES as readonly string[]).includes(value);
}

/**
 * Where a designed ad's look comes from. "brand": the brand's own past ads, or the standard layout when the
 * kit holds none. "fresh": a new layout each time, in the brand's colours and fonts, with no past ad shown
 * to the image model.
 */
export const DESIGN_STYLES = ["brand", "fresh"] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];
export function isDesignStyle(value: string): value is DesignStyle {
  return (DESIGN_STYLES as readonly string[]).includes(value);
}
export function designStyleWords(style: DesignStyle, styleRefs: number) {
  if (style === "fresh") return { label: "New design", what: "A new layout for each variation, in your colours and fonts. Your past ads are not shown to the designer. Your words stay exactly as written." };
  return styleRefs > 0
    ? { label: "Like your past ads", what: `Follows the look of the ${styleRefs === 1 ? "ad" : `${styleRefs} ads`} saved in your brand kit.` }
    : { label: "Standard layout", what: "Top bar, big headline, one visual, button. Add your own past ads to the brand kit and this follows their look instead." };
}

/** Layouts a new design can take. Each variation of a set gets a different one, so the four do not look alike. */
export const FRESH_LAYOUTS = [
  "Visual first: the central visual fills the upper two thirds, large and dramatic, with the headline set big beneath it.",
  "Type first: the headline fills most of the ad in oversized type, with the visual small and sharp in one corner.",
  "Split: the ad is divided into two blocks of contrasting colour, words in one and the visual in the other.",
  "Card: the visual and its labels sit inside one large rounded card that floats over the background, with the headline above the card.",
] as const;

export type DesignedText = { eyebrow: string; kicker: string; headline: string; accent: string; visual: string; labels: string[]; subline: string; cta: string; /** Small print shown when the labels are example figures. */ note?: string };

const quoted = (value: string) => `"${value.replace(/"/g, "'")}"`;

/**
 * The prompt for a designed ad. Every word the picture may show is given exactly, top to bottom, and the
 * look comes from the brand kit: its colours, its fonts and pictures of its own past ads. The reference ad a
 * creative was modelled on is never part of it.
 */
export function designedPrompt(args: { text: DesignedText; kit: Pick<BrandContent, "name" | "colors" | "headingFont" | "imageStyle" | "industry">; placement: Placement; tone: Tone; styleRefs: number; style?: DesignStyle; /** The variation's position in its set, so new designs differ from each other. */ variant?: number }) {
  const { text, kit, placement, tone } = args;
  const fresh = args.style === "fresh";
  // A new design is never shown a past ad.
  const styleRefs = fresh ? 0 : args.styleRefs;
  const note = text.note && text.labels.length ? `   Directly beneath the visual, in very small print: ${quoted(text.note)}.` : "";
  const accent = kit.colors[0]?.hex ?? "#7c6cf6";
  const wide = placement === "16:9" || placement === "1.91:1";
  const layout = [
    text.eyebrow ? `1. A full-width bar across the very top in the accent colour, holding one centred line: ${quoted(text.eyebrow)}.` : "",
    text.kicker ? `2. Under it, a small line in widely spaced capitals: ${quoted(text.kicker.toUpperCase())}.` : "",
    `3. The headline, very large and very bold, the biggest thing on the ad: ${quoted(text.headline)}.${text.accent && text.headline.includes(text.accent) ? ` Set the words ${quoted(text.accent)} in the accent colour and the rest in the main text colour.` : ""}`,
    `4. One central visual, clean and simple, that makes the headline's point at a glance: ${text.visual}`,
    text.labels.length ? `   Label it with exactly these short callouts, each joined to its part by a thin line: ${text.labels.map(quoted).join(", ")}.` : "   No labels on the visual.",
    note,
    text.subline ? `5. Under the visual, one line of medium-weight text: ${quoted(text.subline)}.` : "",
    text.cta ? `6. At the bottom, one wide rounded button in the accent colour with the words ${quoted(text.cta.toUpperCase())} and a small arrow.` : "",
  ].filter(Boolean);
  return [
    `Design a finished static advertisement for ${kit.name}${kit.industry ? `, a business in ${kit.industry}` : ""}. Flat graphic design, like a polished social media ad. Not a photograph of an ad.`,
    ...(fresh
      ? [
          `Compose a new layout for a ${wide ? "wide" : placement === "9:16" ? "tall" : "square or portrait"} frame. ${FRESH_LAYOUTS[(args.variant ?? 0) % FRESH_LAYOUTS.length]} Do not fall back on a plain stack of bar, headline, picture and button.`,
          "It must contain every one of these parts, placed where they serve the layout. The headline stays the largest text:",
        ]
      : [`Layout, ${wide ? "arranged for a wide frame with the words on the left and the visual on the right" : "stacked top to bottom"}:`]),
    ...(fresh ? layout.map(freeLine) : layout),
    `Colours: ${tone === "dark" ? "a near-black background with white text" : "a soft, very light tint of the accent colour as the background, with near-black text"}. Accent colour ${accent}.${kit.colors.length > 1 ? ` Other brand colours, used sparingly: ${kit.colors.slice(1).map((row) => row.hex).join(", ")}.` : ""}`,
    `Type: a heavy, modern sans-serif${kit.headingFont ? ` in the manner of ${kit.headingFont}` : ""}, with tight spacing on the headline. Generous margins. Nothing touches the edges.`,
    kit.imageStyle ? `The central visual follows this style: ${kit.imageStyle}` : "The central visual is a soft, glossy 3D object or a clean diagram, lit from above.",
    styleRefs > 0 ? `The ${styleRefs === 1 ? "attached image is an ad" : `${styleRefs} attached images are ads`} this brand has run. Follow their look: the layout rhythm, the weight of the type, the lighting and finish of the visual. Do not reuse their words or repeat their visual.` : "",
    "Text rules: show exactly the words given above, spelled exactly as written, each once. No other words, numbers, small print, fake interface text or placeholder text anywhere.",
    "Never: a logo or brand mark, a watermark, a real or recognisable person, a celebrity, another business's product or packaging.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A layout line with its fixed position taken out, for a new design that places the parts itself. */
function freeLine(line: string) {
  return line
    .replace(/^(\s*)\d\. /, "$1- ")
    .replace("A full-width bar across the very top in the accent colour, holding one centred line", "A short tag or bar in the accent colour holding one line")
    .replace("Under it, a small line", "A small line")
    .replace("Under the visual, one line", "One line")
    .replace("At the bottom, one wide rounded button", "One rounded button");
}

/** The lines a designed ad must show that a reading of the picture did not find, compared without case or punctuation. */
export function missingText(expected: string[], seen: string[]): string[] {
  const all = ` ${words(seen.join(" ")).join(" ")} `;
  return expected.filter((line) => {
    const needle = words(line).join(" ");
    return needle.length > 0 && !all.includes(` ${needle} `);
  });
}

/** What a failed image says, in plain words. */
export const IMAGE_FAIL_WORDS: Record<string, string> = {
  no_key: "Image making is not set up for this organization yet, so this image was not made and nothing was charged. Ask your Vistrial contact to switch images on.",
  no_credit: "The image service could not be paid for on our side, so this image was not made and nothing was charged. Your Vistrial contact has to fix this.",
  blocked: "The image service did not allow this request. Nothing was charged.",
  unpriced_model: "The image model has no price set, so it cannot run.",
  rate_limited: "The image service was busy. Try this one again in a minute.",
  auth_failed: "The image service did not accept our key, so this image was not made and nothing was charged. Your Vistrial contact has to fix this.",
  bad_request: "The image service could not make this one.",
  refused: "The image service declined to make this one. Try again, or edit the image direction.",
  connection_failed: "The image service could not be reached. Try again in a minute.",
  provider_error: "The image service did not answer. Try again in a minute.",
  text_wrong: "The picture came out with the wrong words twice, so it was not kept and you were not charged. Try it again.",
  no_route: "No model is set for checking the words in a picture. A platform admin sets one.",
};
