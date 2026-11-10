/**
 * Images for an ad set: what is asked of the image model, and what it costs. Pure, so the server and the
 * screen share it. The picture is always made without text and without a logo. The headline, the button and
 * the brand's real logo file are placed on top in code, so the words are exact and the logo is the real one.
 */

import { PLACEMENTS, type BrandContent, type Placement } from "./brandKits";
import type { ImageAspect, ImageSize } from "./gemini";

export const IMAGE_SIZE: ImageSize = "2K";
export const MAX_IMAGES_PER_BATCH = 12;
export const MAX_IMAGES_PER_DAY = 60;

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

/** What a failed image says, in plain words. */
export const IMAGE_FAIL_WORDS: Record<string, string> = {
  no_key: "Image making is not switched on yet. A platform admin adds the key.",
  unpriced_model: "The image model has no price set, so it cannot run.",
  rate_limited: "The image service was busy. Try this one again in a minute.",
  auth_failed: "The image service did not accept our key. A platform admin fixes this.",
  bad_request: "The image service could not make this one.",
  refused: "The image service declined to make this one. Try again, or edit the image direction.",
  connection_failed: "The image service could not be reached. Try again in a minute.",
  provider_error: "The image service did not answer. Try again in a minute.",
};
