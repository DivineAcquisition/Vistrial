/**
 * One call to Google's Gemini API (the Interactions endpoint), used to watch a reference video and return
 * its structure as JSON. The video is never downloaded from a platform: a public YouTube link is passed to
 * Gemini as a link, and a file the person uploaded is sent as the bytes they gave us. Nothing is stored on
 * Google's side (`store: false`).
 *
 * Request and response shapes follow https://aistudio.google.com/docs/video-understanding and the
 * Interactions API reference, read on 2026-11-10. Prices are from https://aistudio.google.com/docs/pricing
 * on the same day; a model missing from the table cannot run, so cost is never guessed.
 */

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_VIDEO_MODEL = "gemini-3.8-flash";

/** Dollars per million tokens. Gemini 3.8 Flash is listed to double on 2027-01-01: update this then. */
export const GEMINI_PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
};

export function videoModel() {
  return process.env.GEMINI_VIDEO_MODEL?.trim() || DEFAULT_VIDEO_MODEL;
}

export type GeminiPart = { type: "text"; text: string } | { type: "video"; uri: string } | { type: "video"; data: string; mime_type: string };

export type GeminiRequest = {
  model: string;
  system?: string;
  parts: GeminiPart[];
  /** JSON schema the answer must match. */
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
};

export type GeminiResult = { text: string; inputTokens: number; outputTokens: number; costCents: number; model: string };

/** Why a call failed, as a code a screen has words for. Never the provider's own message. */
export class GeminiError extends Error {
  constructor(
    readonly code: "no_key" | "unpriced_model" | "provider_error" | "rate_limited" | "refused" | "bad_request" | "auth_failed" | "connection_failed" | "no_credit" | "blocked",
    readonly costCents = 0,
  ) {
    super(code);
  }
}

export function geminiCostCents(model: string, inputTokens: number, outputTokens: number) {
  const price = GEMINI_PRICES[model];
  if (!price) throw new GeminiError("unpriced_model");
  return Math.ceil(((inputTokens * price.input + outputTokens * price.output) / 1_000_000) * 100);
}

/** The body sent to Gemini. Exported so a test can see exactly what leaves. */
export function geminiBody(request: GeminiRequest) {
  return {
    model: request.model,
    input: request.parts,
    ...(request.system ? { system_instruction: request.system } : {}),
    response_format: { type: "text", mime_type: "application/json", schema: request.schema },
    generation_config: { max_output_tokens: request.maxOutputTokens ?? 4000 },
    // Nothing about a customer's reference is kept on Google's side.
    store: false,
  };
}

type Interaction = {
  status?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { total_input_tokens?: number; total_output_tokens?: number; total_thought_tokens?: number };
};

/** The text of the last model output step, and what the call cost. Thinking tokens are billed as output. */
export function readInteraction(model: string, body: Interaction): GeminiResult {
  const inputTokens = body.usage?.total_input_tokens ?? 0;
  const outputTokens = (body.usage?.total_output_tokens ?? 0) + (body.usage?.total_thought_tokens ?? 0);
  const costCents = geminiCostCents(model, inputTokens, outputTokens);
  const output = [...(body.steps ?? [])].reverse().find((step) => step.type === "model_output");
  const text = (output?.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
  if (body.status !== "completed" || !text) throw new GeminiError("refused", costCents);
  return { text, inputTokens, outputTokens, costCents, model };
}

/** Tests swap the network call for a scripted one. Nothing in the product sets this. */
export type ScriptedGemini = (body: ReturnType<typeof geminiBody>) => Interaction;

export async function callGemini(request: GeminiRequest): Promise<GeminiResult> {
  if (!GEMINI_PRICES[request.model]) throw new GeminiError("unpriced_model");
  const body = geminiBody(request);
  const scripted = (globalThis as { __vistrialScriptedGemini?: ScriptedGemini }).__vistrialScriptedGemini;
  const key = process.env.GEMINI_API_KEY;
  if (scripted && !key) return readInteraction(request.model, scripted(body));
  if (!key) throw new GeminiError("no_key");
  let response: Response;
  try {
    response = await fetch(GEMINI_ENDPOINT, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new GeminiError("connection_failed");
  }
  if (!response.ok) {
    if (response.status === 429) throw new GeminiError("rate_limited");
    if (response.status === 401 || response.status === 403) throw new GeminiError("auth_failed");
    if (response.status === 400) throw new GeminiError("bad_request");
    throw new GeminiError("provider_error");
  }
  let parsed: Interaction;
  try {
    parsed = (await response.json()) as Interaction;
  } catch {
    throw new GeminiError("provider_error");
  }
  return readInteraction(request.model, parsed);
}

// ---------------------------------------------------------------------------------------------- images

export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";

/**
 * Dollars per image by size, from the same pricing page. Charged per image delivered: an image that fails or
 * is refused costs the customer nothing.
 */
export const GEMINI_IMAGE_PRICES: Record<string, Record<ImageSize, number>> = {
  "gemini-nano-banana-2.1": { "1K": 0.0336, "2K": 0.0504 },
  // The model Google's docs recommend when the words in the picture must be right.
  "gemini-3-pro-image": { "1K": 0.134, "2K": 0.134 },
};

export const DEFAULT_DESIGN_MODEL = "gemini-3-pro-image";

/** The model for a designed ad, where the text is part of the picture. */
export function designModel() {
  return process.env.GEMINI_DESIGN_MODEL?.trim() || DEFAULT_DESIGN_MODEL;
}

export type ImageSize = "1K" | "2K";
/** The aspect ratios Nano Banana 2.1 makes that we use. A link ad (1.91:1) is cut from 16:9. */
export type ImageAspect = "1:1" | "4:5" | "9:16" | "16:9";

export function imageModel() {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

/** What one image costs us, in cents (a fraction of a cent is kept). Throws for a model with no price. */
export function imageCostCents(model: string, size: ImageSize) {
  const price = GEMINI_IMAGE_PRICES[model]?.[size];
  if (price === undefined) throw new GeminiError("unpriced_model");
  return Math.round(price * 100 * 100) / 100;
}

export type ReferenceImage = { data: string; mimeType: string };
export type GeminiImageRequest = { model: string; prompt: string; aspect: ImageAspect; size: ImageSize; /** Pictures of the look to follow: the brand's own ads only. */ references?: ReferenceImage[] };
type ImageInput = { type: "text"; text: string } | { type: "image"; mime_type: string; data: string };

export function geminiImageBody(request: GeminiImageRequest) {
  const input: ImageInput[] = [{ type: "text", text: request.prompt }, ...(request.references ?? []).map((row) => ({ type: "image" as const, mime_type: row.mimeType, data: row.data }))];
  return {
    model: request.model,
    input,
    response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: request.aspect, image_size: request.size },
    store: false,
  };
}

type ImageInteraction = { status?: string; steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string }[] }[] };

/** The last image the model put out, as base64. */
export function readImage(body: ImageInteraction): { data: string; mimeType: string } {
  const output = [...(body.steps ?? [])].reverse().find((step) => step.type === "model_output");
  const image = [...(output?.content ?? [])].reverse().find((block) => block.type === "image" && typeof block.data === "string" && block.data.length > 0);
  if (body.status !== "completed" || !image?.data) throw new GeminiError("refused");
  return { data: image.data, mimeType: image.mime_type || "image/jpeg" };
}

export type ScriptedGeminiImage = (body: ReturnType<typeof geminiImageBody>) => ImageInteraction;

export async function callGeminiImage(request: GeminiImageRequest): Promise<{ data: string; mimeType: string; costCents: number; model: string }> {
  const costCents = imageCostCents(request.model, request.size);
  const body = geminiImageBody(request);
  const scripted = (globalThis as { __vistrialScriptedGeminiImage?: ScriptedGeminiImage }).__vistrialScriptedGeminiImage;
  const key = process.env.GEMINI_API_KEY;
  if (scripted && !key) return { ...readImage(scripted(body)), costCents, model: request.model };
  if (!key) throw new GeminiError("no_key");
  let response: Response;
  try {
    response = await fetch(GEMINI_ENDPOINT, { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new GeminiError("connection_failed");
  }
  if (!response.ok) {
    if (response.status === 429) throw new GeminiError("rate_limited");
    if (response.status === 401 || response.status === 403) throw new GeminiError("auth_failed");
    if (response.status === 400) throw new GeminiError("bad_request");
    throw new GeminiError("provider_error");
  }
  let parsed: ImageInteraction;
  try {
    parsed = (await response.json()) as ImageInteraction;
  } catch {
    throw new GeminiError("provider_error");
  }
  return { ...readImage(parsed), costCents, model: request.model };
}
