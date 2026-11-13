/**
 * OpenRouter, as one more provider behind the model router. It reaches other companies' models (GPT,
 * Gemini) with one key, `OPENROUTER_API_KEY`. Without that key every call answers `no_key` and nothing else
 * in the product changes.
 *
 * It speaks OpenRouter's Anthropic-format endpoint (`POST /api/v1/messages`), which takes and returns the
 * same shapes as Anthropic's Messages API. So the tool loop, refusals, structured output and the fallback in
 * toolRouter.ts are shared, not copied. What differs lives here: where the request goes, the routing rules
 * sent with it, how web search is declared, what a call cost, and how an error becomes a code.
 *
 * Shapes follow OpenRouter's API reference, read on 2026-11-13; the notes are in
 * docs/rebuild/assets/openrouter-facts-2026-11-13.md. No real call could be made when this was written:
 * docs/rebuild/models-and-openrouter.md, section 8, lists what the first one must prove, and
 * convex/modelCheck.ts makes those calls.
 */
import type Anthropic from "@anthropic-ai/sdk";

import { MAX_TOKENS, ModelError, NO_SPEND, PRICES, costCents, type Completion, type Spend } from "./modelRouter";
import type { WorkKind } from "./registry";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/messages";

/**
 * Sent with every request, so customer content only goes where these hold:
 * - `data_collection: "deny"`: only hosts that do not collect the content.
 * - `zdr: true`: only hosts on OpenRouter's zero data retention list (Azure for GPT, Google Cloud for
 *   Gemini on 2026-11-13; Google Cloud may keep a request its safety systems flag).
 * - `require_parameters: true`: only hosts that really support what the request asks for (structured
 *   output, tools), since the same model is served by several.
 * If no host qualifies the request fails. It is never sent somewhere else.
 */
export const OPENROUTER_ROUTING = { data_collection: "deny", zdr: true, require_parameters: true } as const;

export function openRouterKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY?.trim() || undefined;
}

/**
 * Web search through OpenRouter stays off until a real call has shown the pages a search found come back in
 * a shape the router reads (design, section 8, check 5). A Platform Admin then sets OPENROUTER_WEB_SEARCH=on.
 */
export function openRouterWebSearchOn(): boolean {
  return process.env.OPENROUTER_WEB_SEARCH?.trim().toLowerCase() === "on";
}

type Params = Anthropic.MessageCreateParamsNonStreaming;
export type OpenRouterCreate = (params: Params) => Promise<Anthropic.Message>;

/** What a request to OpenRouter answers: the HTTP status and the parsed JSON body (null when it is not JSON). */
export type OpenRouterReply = { status: number; body: unknown };

/** Tests swap the network call for a scripted one. Nothing in the product sets this, and a real key wins over it. */
export type ScriptedOpenRouter = (body: Record<string, unknown>) => OpenRouterReply;

/** The body sent to OpenRouter. Exported so a test can see exactly what leaves. */
export function openRouterBody(params: Params): Record<string, unknown> {
  return { ...params, provider: OPENROUTER_ROUTING };
}

type WebLimits = { maxUses: number; allowedDomains?: string[]; blockedDomains?: string[] };

/**
 * How a web search is declared to OpenRouter. `engine: "native"` means the search runs on the model host's
 * own search and is never handed to another search company; if the host cannot search, the request fails.
 * Google's own search takes no domain filters, so a step that sets them cannot run on a Google model.
 */
export function openRouterWebSearchTool(model: string, limits: WebLimits): Record<string, unknown> {
  const filtered = Boolean(limits.allowedDomains?.length || limits.blockedDomains?.length);
  if (filtered && model.startsWith("google/")) throw new ModelError("unsupported_tool", false);
  return {
    type: "openrouter:web_search",
    parameters: {
      engine: "native",
      max_uses: limits.maxUses,
      ...(limits.allowedDomains?.length ? { allowed_domains: limits.allowedDomains } : {}),
      ...(limits.blockedDomains?.length ? { excluded_domains: limits.blockedDomains } : {}),
    },
  };
}

/**
 * Only Anthropic's own search honours `max_uses`; other hosts ignore it. This stops OpenRouter's server-side
 * tool loop after the same number of steps, so the limit a skill set still holds.
 */
export function openRouterToolBudget(maxUses: number) {
  return { stop_server_tools_when: [{ type: "step_count_is", step_count: maxUses }] };
}

/** What OpenRouter says the call cost, in cents, or null when it reports none. `usage.cost` is in US dollars and includes search fees. */
export function reportedCents(usage: unknown): number | null {
  const cost = (usage as { cost?: unknown } | null | undefined)?.cost;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return null;
  return Math.round(cost * 100 * 10_000) / 10_000;
}

/** OpenRouter's stable machine code for an error, wherever the format puts it. Never its message. */
function errorType(body: unknown): string | null {
  const error = (body as { error?: { error_type?: unknown; metadata?: { error_type?: unknown } } } | null)?.error;
  const value = error?.error_type ?? error?.metadata?.error_type;
  return typeof value === "string" ? value : null;
}

const BY_TYPE: Record<string, [code: string, retryable: boolean]> = {
  authentication: ["auth_failed", false],
  payment_required: ["no_credit", false],
  permission_denied: ["blocked", false],
  rate_limit_exceeded: ["rate_limited", true],
  provider_overloaded: ["provider_error", true],
  provider_unavailable: ["provider_error", true],
  server: ["provider_error", true],
  timeout: ["provider_error", true],
  unmapped: ["provider_error", true],
  refusal: ["refused", true],
  content_policy_violation: ["refused", true],
  not_found: ["no_provider", false],
  context_length_exceeded: ["bad_request", false],
  max_tokens_exceeded: ["bad_request", false],
  token_limit_exceeded: ["bad_request", false],
  invalid_request: ["bad_request", false],
  invalid_prompt: ["bad_request", false],
};

/**
 * Maps a failed request to one of our result codes. The machine code decides when there is one, the HTTP
 * status otherwise. Nothing from OpenRouter's or the model host's message is kept.
 */
export function openRouterError(status: number, body: unknown, spent: Spend = NO_SPEND): ModelError {
  const known = BY_TYPE[errorType(body) ?? ""];
  if (known) return new ModelError(known[0], known[1], spent);
  if (status === 401) return new ModelError("auth_failed", false, spent);
  if (status === 402) return new ModelError("no_credit", false, spent);
  if (status === 403) return new ModelError("blocked", false, spent);
  if (status === 404) return new ModelError("no_provider", false, spent);
  if (status === 429) return new ModelError("rate_limited", true, spent);
  // 503: no host meets the routing rules right now. The fallback model may have one.
  if (status === 503) return new ModelError("no_provider", true, spent);
  if (status >= 400 && status < 500) return new ModelError("bad_request", false, spent);
  return new ModelError("provider_error", true, spent);
}

function isMessage(body: unknown): body is Anthropic.Message {
  const row = body as { content?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null;
  return Boolean(row && Array.isArray(row.content) && row.usage && typeof row.usage.input_tokens === "number" && typeof row.usage.output_tokens === "number");
}

/** Turns a reply into a message, or throws the code for what went wrong. A 200 can carry an error: the body is checked, not only the status. */
export function readReply(reply: OpenRouterReply): Anthropic.Message {
  const body = reply.body;
  if (reply.status < 200 || reply.status >= 300) throw openRouterError(reply.status, body);
  const failed = body as { type?: unknown; error?: { code?: unknown } } | null;
  if (failed && (failed.type === "error" || failed.error)) {
    const code = typeof failed.error?.code === "number" ? failed.error.code : 502;
    throw openRouterError(code, body);
  }
  if (!isMessage(body)) throw new ModelError("provider_error", true);
  return body;
}

async function send(body: Record<string, unknown>): Promise<OpenRouterReply> {
  const key = openRouterKey();
  const scripted = (globalThis as { __vistrialScriptedOpenRouter?: ScriptedOpenRouter }).__vistrialScriptedOpenRouter;
  if (scripted && !key) return scripted(body);
  if (!key) throw new ModelError("no_key", false);
  let response: Response;
  try {
    // No HTTP-Referer header: it would create a public app page on OpenRouter.
    response = await fetch(OPENROUTER_URL, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ModelError("connection_failed", true);
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Not JSON: the status alone decides.
  }
  return { status: response.status, body: parsed };
}

/** The one network call for a model on OpenRouter. A model with no price cannot run. */
export function openRouterCreate(model: string): OpenRouterCreate {
  const scripted = (globalThis as { __vistrialScriptedOpenRouter?: ScriptedOpenRouter }).__vistrialScriptedOpenRouter;
  if (!openRouterKey() && !scripted) throw new ModelError("no_key", false);
  if (!PRICES[model]) throw new ModelError("unpriced_model", false);
  return async (params) => readReply(await send(openRouterBody(params)));
}

/** A plain call with no tools: the same contract as `claudeComplete`. A refusal is billed, so its cost rides on the error. */
export async function openRouterComplete(model: string, workKind: WorkKind, input: string): Promise<Completion> {
  const create = openRouterCreate(model);
  const response = await create({ model, max_tokens: MAX_TOKENS[workKind], messages: [{ role: "user", content: input }] });
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const spent = { inputTokens, outputTokens, costCents: reportedCents(response.usage) ?? costCents(model, inputTokens, outputTokens) };
  if (response.stop_reason === "refusal") throw new ModelError("refused", true, spent);
  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
  return { text, ...spent, provider: "openrouter", model };
}
