import "server-only";

import { ProviderUnavailable, isUnavailableStatus } from "@/lib/scribe/provider";

export const GEMINI_EMBED_MODEL = "gemini-embedding-001";
export const GEMINI_EMBED_DIMENSIONS = 768;
const DEFAULT_EXTRACT_MODEL = "gemini-2.5-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const EMBED_BATCH = 100;

export function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  return key ? key : null;
}

export function geminiExtractModel(): string {
  return process.env.GEMINI_EXTRACT_MODEL?.trim() || DEFAULT_EXTRACT_MODEL;
}

async function post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const key = geminiApiKey();
  if (!key) throw new ProviderUnavailable("gemini", "missing_key");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw new ProviderUnavailable("gemini", "timeout");
    throw new ProviderUnavailable("gemini", "network");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    if (isUnavailableStatus(response.status)) {
      throw new ProviderUnavailable("gemini", `http_${response.status}`, response.status);
    }
    throw new Error(`gemini_http_${response.status}`);
  }
  return response.json();
}

export type GeminiResult = { text: string; model: string; inputTokens: number; outputTokens: number };

/** One JSON-only generation. The response text is the JSON document. */
export async function geminiGenerateJson(args: {
  system: string;
  user: string;
  model?: string;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const model = args.model?.trim() || geminiExtractModel();
  const body = (await post(
    `models/${encodeURIComponent(model)}:generateContent`,
    {
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts: [{ text: args.user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 8192 },
    },
    args.timeoutMs ?? 90_000
  )) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    modelVersion?: string;
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("invalid_json");
  return {
    text,
    model: body.modelVersion ?? model,
    inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Embeddings at 768 dimensions, in input order. */
export async function geminiEmbed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const chunk = texts.slice(i, i + EMBED_BATCH);
    const body = (await post(
      `models/${GEMINI_EMBED_MODEL}:batchEmbedContents`,
      {
        requests: chunk.map((text) => ({
          model: `models/${GEMINI_EMBED_MODEL}`,
          content: { parts: [{ text: text.slice(0, 8000) }] },
          taskType: task,
          outputDimensionality: GEMINI_EMBED_DIMENSIONS,
        })),
      },
      60_000
    )) as { embeddings?: Array<{ values?: number[] }> };
    const vectors = body.embeddings ?? [];
    if (vectors.length !== chunk.length) throw new Error("gemini_embed_mismatch");
    for (const vector of vectors) {
      if (!vector.values || vector.values.length !== GEMINI_EMBED_DIMENSIONS) throw new Error("gemini_embed_mismatch");
      out.push(vector.values);
    }
  }
  return out;
}

/** pgvector's text form, accepted through PostgREST. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? Number(v.toFixed(7)) : 0)).join(",")}]`;
}
