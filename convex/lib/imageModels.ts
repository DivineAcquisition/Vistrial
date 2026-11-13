/**
 * Making an image, through whichever key this deployment has. With GEMINI_API_KEY it goes to Google
 * directly, as it always did. Without it, and with OPENROUTER_API_KEY, the same Google models are reached
 * through OpenRouter's image endpoint. With neither, nothing is started and nothing is charged.
 *
 * OpenRouter's request and response shapes follow its API reference ("Generate an image"), read on
 * 2026-11-13: docs/rebuild/assets/openrouter-facts-2026-11-13.md, section 12. No real call could be made when
 * this was written; docs/rebuild/models-and-openrouter.md, section 8, check 9, is what the first one must show.
 */
import { GEMINI_IMAGE_PRICES, GeminiError, callGeminiImage, imageCostCents, type GeminiImageRequest, type ImageAspect, type ImageSize, type ScriptedGeminiImage } from "./gemini";
import type { Family, ModelMark } from "./models";
import { OPENROUTER_FEE, openRouterCents, openRouterKey, reportedCents } from "./openrouter";

export const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";

/**
 * OpenAI's image model, reached through OpenRouter only. Its id, shapes and parameters were read from
 * OpenRouter's image models endpoint on 2026-11-13. It is priced by the token, not by the picture, so there
 * is no list price to quote: see `gptImageQuoteCents`.
 */
export const GPT_IMAGE_MODEL = "openai/gpt-image-2.6-sunburst";

/** The plain name of each image model, its family, and its OpenRouter id. A model missing here cannot be made through OpenRouter. */
export const IMAGE_MODELS: Record<string, { name: string; family: Family; openRouterId: string }> = {
  "gemini-nano-banana-2.1": { name: "Nano Banana 2.1", family: "gemini", openRouterId: "google/gemini-nano-banana-2.1" },
  "gemini-3-pro-image": { name: "Nano Banana Pro", family: "gemini", openRouterId: "google/gemini-3-pro-image" },
  [GPT_IMAGE_MODEL]: { name: "GPT Image 2.6 Sunburst", family: "gpt", openRouterId: GPT_IMAGE_MODEL },
};

export type ImageFamily = "gemini" | "gpt";

/** The family that makes a stored image model's pictures. An unknown model reads as Gemini, the only maker before GPT. */
export function imageFamilyOf(model: string | undefined): ImageFamily {
  return model && IMAGE_MODELS[model]?.family === "gpt" ? "gpt" : "gemini";
}

/** The mark for a stored image model. Null for a model with no known name: the screen then shows nothing. */
export function imageMark(model: string | undefined): ModelMark | null {
  const known = model ? IMAGE_MODELS[model] : undefined;
  return known ? { family: known.family, name: known.name } : null;
}

/** The shapes GPT Image lists. It has no 4:5, so a placement of that shape cannot be made with it. */
export const GPT_IMAGE_ASPECTS: readonly ImageAspect[] = ["1:1", "9:16", "16:9"];

/** The quality asked of GPT Image, always the same one, so a measured cost stays true. */
export const GPT_IMAGE_QUALITY = "high";

/** A real image may cost this much more than the one that was measured before the quote stops covering it. */
export const GPT_IMAGE_HEADROOM = 1.5;

/**
 * What one GPT image was measured to cost, in cents, before OpenRouter's fee: the figure `modelCheck:run`
 * reports from real calls, which a Platform Admin then sets as GPT_IMAGE_MEASURED_CENTS. Null until that is
 * done. GPT images stay closed until then: there is nothing honest to quote.
 */
export function gptImageMeasuredCents(): number | null {
  const value = Number(process.env.GPT_IMAGE_MEASURED_CENTS?.trim() || Number.NaN);
  return Number.isFinite(value) && value > 0 && value <= 500 ? value : null;
}

/**
 * The most one GPT image is charged, in cents: the measured cost with OpenRouter's fee, plus headroom. A
 * person is quoted "up to" this. What is charged is what the call really cost, and never more than this.
 */
export function gptImageQuoteCents(): number | null {
  const measured = gptImageMeasuredCents();
  return measured === null ? null : Math.ceil(measured * (1 + OPENROUTER_FEE) * GPT_IMAGE_HEADROOM * 100) / 100;
}

/**
 * Whether GPT images are offered here: OpenRouter's key, the owner's switch for the GPT family
 * (MODEL_FAMILIES, the same switch as for text), and a measured price.
 */
export function gptImagesOpen(): boolean {
  const families = (process.env.MODEL_FAMILIES ?? "").split(",").map((value) => value.trim().toLowerCase());
  return Boolean(openRouterKey() || hooks().__vistrialScriptedOpenRouterImage) && families.includes("gpt") && gptImageMeasuredCents() !== null;
}

/**
 * What one Gemini image costs us, in cents: the list price, with OpenRouter's fee when that is the way it
 * is made. The price a person confirms and the amount charged both come from here.
 */
export function geminiImageCents(model: string, size: ImageSize): number {
  const list = imageCostCents(model, size);
  return imageVia() === "openrouter" ? Math.round(list * (1 + OPENROUTER_FEE) * 100) / 100 : list;
}

export type ImageVia = "google" | "openrouter";

type Hooks = { __vistrialScriptedGeminiImage?: ScriptedGeminiImage; __vistrialScriptedOpenRouterImage?: ScriptedOpenRouterImage };
const hooks = () => globalThis as Hooks;

/**
 * Which way images are made here, or null when image making is not set up. The direct Google key wins when
 * both are set. (A test's scripted model counts as set up; nothing in the product sets one.)
 */
export function imageVia(): ImageVia | null {
  if (process.env.GEMINI_API_KEY?.trim() || hooks().__vistrialScriptedGeminiImage) return "google";
  if (openRouterKey() || hooks().__vistrialScriptedOpenRouterImage) return "openrouter";
  return null;
}

/**
 * What a person is told when images cannot be made, before anything is started. A Platform Admin is told the
 * exact setting; everyone else is told what happened and what they can do.
 */
export const IMAGE_SETUP_WORDS = {
  admin: "Image making needs a key. Set OPENROUTER_API_KEY or GEMINI_API_KEY in this Convex deployment's environment variables (Settings, Environment Variables). Neither is set.",
  everyone: "Image making is not set up on this workspace yet, so no image was made and nothing was charged. Your ad copy is ready to use as it is. Ask your Vistrial contact to switch images on, or write to contact@vistrial.io.",
} as const;

/** The same split for an image that failed for a reason only a Platform Admin can fix. Other reasons read the same for everyone. */
export const IMAGE_ADMIN_WORDS: Record<string, string> = {
  no_key: IMAGE_SETUP_WORDS.admin,
  auth_failed: "The image service refused the key. Check that OPENROUTER_API_KEY (or GEMINI_API_KEY, which is used first when both are set) in this Convex deployment's environment variables is current.",
  no_credit: "The OpenRouter account is out of credit. Add credit at openrouter.ai, or raise the key's spending limit.",
  blocked: "OpenRouter did not allow this request. Check the key's guardrails and the account's privacy settings: the request is pinned to Google Cloud (google-vertex).",
  unpriced_model: "The image model has no price in GEMINI_IMAGE_PRICES, or no OpenRouter id in IMAGE_MODELS, so it cannot run. Check GEMINI_IMAGE_MODEL and GEMINI_DESIGN_MODEL.",
};

export type OpenRouterImageReply = { status: number; body: unknown };
/** Tests swap the network call for a scripted one. Nothing in the product sets this, and a real key wins over it. */
export type ScriptedOpenRouterImage = (body: ReturnType<typeof openRouterImageBody>) => OpenRouterImageReply;

/**
 * The body sent to OpenRouter. Exported so a test can see exactly what leaves. The image endpoint's routing
 * takes no data-policy fields, so a Gemini request is pinned to Google Cloud, the host on OpenRouter's zero
 * data retention list for these models, and may not fall back anywhere else. GPT Image is served by OpenAI
 * alone, which is not on that list; the privacy policy says so. It takes a quality, not a resolution.
 */
export function openRouterImageBody(request: GeminiImageRequest) {
  const known = IMAGE_MODELS[request.model];
  if (!known) throw new GeminiError("unpriced_model");
  const gpt = known.family === "gpt";
  if (gpt && !GPT_IMAGE_ASPECTS.includes(request.aspect)) throw new GeminiError("bad_request");
  return {
    model: known.openRouterId,
    prompt: request.prompt,
    aspect_ratio: request.aspect,
    ...(gpt ? { quality: GPT_IMAGE_QUALITY } : { resolution: request.size }),
    n: 1,
    ...(request.references?.length ? { input_references: request.references.map((row) => ({ type: "image_url" as const, image_url: { url: `data:${row.mimeType};base64,${row.data}` } })) } : {}),
    provider: { only: [gpt ? "openai" : "google-vertex"], allow_fallbacks: false },
  };
}

/** The picture out of a reply, or the code for what went wrong. Nothing from the service's message is kept. */
export function readOpenRouterImage(reply: OpenRouterImageReply): { data: string; mimeType: string; reportedCents: number | null; usage: unknown } {
  const { status, body } = reply;
  if (status === 401) throw new GeminiError("auth_failed");
  if (status === 402) throw new GeminiError("no_credit");
  if (status === 403) throw new GeminiError("blocked");
  if (status === 429) throw new GeminiError("rate_limited");
  if (status === 400 || status === 413 || status === 422) throw new GeminiError("bad_request");
  if (status < 200 || status >= 300) throw new GeminiError("provider_error");
  const row = body as { data?: { b64_json?: unknown; media_type?: unknown }[]; usage?: unknown; error?: unknown } | null;
  const image = row?.data?.[0];
  // A 200 with no picture in it is a refusal or a failure, never an empty image.
  if (!row || row.error || typeof image?.b64_json !== "string" || image.b64_json.length === 0) throw new GeminiError("refused");
  return { data: image.b64_json, mimeType: typeof image.media_type === "string" && image.media_type.startsWith("image/") ? image.media_type : "image/png", reportedCents: reportedCents(row.usage), usage: row.usage };
}

async function callOpenRouterImage(request: GeminiImageRequest) {
  const body = openRouterImageBody(request);
  const key = openRouterKey();
  const scripted = hooks().__vistrialScriptedOpenRouterImage;
  if (scripted && !key) return readOpenRouterImage(scripted(body));
  if (!key) throw new GeminiError("no_key");
  let response: Response;
  try {
    response = await fetch(OPENROUTER_IMAGES_URL, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new GeminiError("connection_failed");
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Not JSON: the status alone decides.
  }
  return readOpenRouterImage({ status: response.status, body: parsed });
}

export type MadeImage = {
  data: string;
  mimeType: string;
  /** What the customer is charged for. Gemini: the price they confirmed. GPT: what the call cost with OpenRouter's fee, never more than the quote they confirmed. */
  costCents: number;
  model: string;
  provider: ImageVia;
  /** What OpenRouter said this image cost, before its fee, kept beside it so the two can be compared. Null when made directly or not reported. */
  reportedCents: number | null;
};

/**
 * Makes one image. A model with no price cannot run: the price is checked before anything is sent, so the
 * amount a person confirmed is the amount charged.
 */
export async function makeImage(request: GeminiImageRequest): Promise<MadeImage> {
  if (imageFamilyOf(request.model) === "gpt") {
    const quote = gptImageQuoteCents();
    const measured = gptImageMeasuredCents();
    if (!gptImagesOpen() || quote === null || measured === null) throw new GeminiError("unpriced_model");
    const image = await callOpenRouterImage(request);
    const cost = Math.round(openRouterCents(image.usage, measured) * 100) / 100;
    return { data: image.data, mimeType: image.mimeType, costCents: Math.min(cost, quote), model: request.model, provider: "openrouter", reportedCents: image.reportedCents };
  }
  if (!GEMINI_IMAGE_PRICES[request.model]) throw new GeminiError("unpriced_model");
  const via = imageVia();
  if (!via) throw new GeminiError("no_key");
  if (via === "google") {
    const image = await callGeminiImage(request);
    return { ...image, provider: "google", reportedCents: null };
  }
  const costCents = geminiImageCents(request.model, request.size);
  const image = await callOpenRouterImage(request);
  return { data: image.data, mimeType: image.mimeType, costCents, model: request.model, provider: "openrouter", reportedCents: image.reportedCents };
}
