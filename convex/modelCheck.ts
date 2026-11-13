/**
 * The first real calls to OpenRouter, made on purpose. No OpenRouter key existed when the provider was
 * written, so nothing about it has been proven against the real service. A Platform Admin runs this once
 * from the Convex dashboard (Functions, then modelCheck:run, then Run) after setting OPENROUTER_API_KEY. It
 * makes a few small calls per model and reports codes, counts and cost. It never returns model text, and it
 * touches no customer data: every prompt is fixed below.
 *
 * What each line must show is in docs/rebuild/models-and-openrouter.md, section 8. Internal, so no client
 * can call it. It spends a few cents of the OpenRouter account's credit.
 */
import type Anthropic from "@anthropic-ai/sdk";

import { internalAction } from "./_generated/server";
import { MODELS as OFFERED } from "./lib/models";
import { ModelError, costCents } from "./lib/modelRouter";
import { OPENROUTER_URL, openRouterBody, openRouterCreate, openRouterKey, openRouterToolBudget, openRouterWebSearchTool, readReply, reportedCents } from "./lib/openrouter";
import { collect, type Citation, type FoundSource } from "./lib/toolRouter";

/** Every model offered through OpenRouter. */
const MODELS = OFFERED.filter((row) => row.provider === "openrouter").map((row) => row.id);

const SCHEMA = { type: "object", properties: { colour: { type: "string" }, count: { type: "integer" } }, required: ["colour", "count"], additionalProperties: false } as const;

/** A 16x16 plain red PNG, so the image check sends no one's picture. */
const RED_PNG = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII=";

type Line = { ok: boolean; code: string; stop?: string | null; host?: string | null; reportedCents?: number | null; tableCents?: number; note?: string };

function failed(error: unknown): Line {
  return { ok: false, code: error instanceof ModelError ? error.code : "threw" };
}

/** What a response says about itself, without its text. `host` is the company that served it (OpenRouter's `provider` field). */
function facts(model: string, message: Anthropic.Message) {
  const host = (message as unknown as { provider?: unknown }).provider;
  return {
    stop: message.stop_reason,
    host: typeof host === "string" ? host : null,
    reportedCents: reportedCents(message.usage),
    tableCents: costCents(model, message.usage.input_tokens, message.usage.output_tokens),
  };
}

const textOf = (message: Anthropic.Message) => message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");

async function plain(model: string): Promise<Line> {
  try {
    const message = await openRouterCreate(model)({ model, max_tokens: 2000, messages: [{ role: "user", content: "Reply with the single word: ready" }] });
    const seen = facts(model, message);
    return { ok: message.stop_reason === "end_turn" && textOf(message).length > 0 && seen.reportedCents !== null, code: "ok", ...seen };
  } catch (error) {
    return failed(error);
  }
}

async function structured(model: string, maxTokens: number): Promise<Line> {
  try {
    const message = await openRouterCreate(model)({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: "A basket holds three red apples. Fill in the colour and the count." }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);
    let matches = false;
    try {
      const parsed = JSON.parse(textOf(message)) as { colour?: unknown; count?: unknown };
      matches = typeof parsed.colour === "string" && parsed.count === 3;
    } catch {
      matches = false;
    }
    return { ok: matches, code: matches ? "ok" : "invalid_output", ...facts(model, message) };
  } catch (error) {
    return failed(error);
  }
}

async function image(model: string): Promise<Line> {
  try {
    const message = await openRouterCreate(model)({
      model,
      max_tokens: 2000,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: RED_PNG } }, { type: "text", text: "What colour is this square? One word." }] }],
    });
    return { ok: /red/i.test(textOf(message)), code: "ok", ...facts(model, message) };
  } catch (error) {
    return failed(error);
  }
}

/** One web search, declared exactly as the router declares it, reading the result with the router's own reader. */
async function search(model: string) {
  try {
    const message = await openRouterCreate(model)({
      model,
      max_tokens: 4000,
      messages: [{ role: "user", content: "Search the web for the official website of the city of Paris, France, and give its address." }],
      tools: [openRouterWebSearchTool(model, { maxUses: 1 }) as unknown as Anthropic.Messages.ToolUnion],
      ...openRouterToolBudget(1),
    } as Anthropic.MessageCreateParamsNonStreaming);
    const sources = new Map<string, FoundSource>();
    const citations: Citation[] = [];
    collect(message.content, sources, citations);
    const blocks: Record<string, number> = {};
    for (const block of message.content) blocks[block.type] = (blocks[block.type] ?? 0) + 1;
    const searches = message.usage.server_tool_use?.web_search_requests ?? 0;
    return {
      // The evidence checks need the pages found. A search that ran but returned none is a failure here.
      ok: sources.size > 0 && searches > 0,
      code: "ok",
      ...facts(model, message),
      searchesCounted: searches,
      sourcesRead: sources.size,
      citationsRead: citations.length,
      /** Which kinds of block came back, so an unread shape can be seen without seeing any text. */
      blocks,
    };
  } catch (error) {
    return failed(error);
  }
}

/** A key that cannot be right must come back as `auth_failed`. Uses no real key. */
async function badKey(): Promise<Line> {
  try {
    const model = MODELS[0];
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: "Bearer sk-or-v1-not-a-real-key", "Content-Type": "application/json" },
      body: JSON.stringify(openRouterBody({ model, max_tokens: 16, messages: [{ role: "user", content: "ready" }] })),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    readReply({ status: response.status, body });
    return { ok: false, code: "accepted", note: "A made-up key was accepted." };
  } catch (error) {
    const line = failed(error);
    return { ...line, ok: line.code === "auth_failed" };
  }
}

export const run = internalAction({
  args: {},
  handler: async () => {
    if (!openRouterKey()) return { ready: false as const, why: "OPENROUTER_API_KEY is not set on this deployment." };
    const models = [];
    for (const model of MODELS) {
      models.push({
        model,
        plain: await plain(model),
        structured: await structured(model, 4000),
        /** The same call with the 8,000-token room a classify step gets: a model that thinks first must still finish. */
        classifyRoom: await structured(model, 8000),
        image: await image(model),
        search: await search(model),
      });
    }
    return {
      ready: true as const,
      /** Every `host` should be Azure (GPT) or Google Vertex (Gemini): the routing rules sent with each request allow nothing else. */
      models,
      badKey: await badKey(),
      next: "If every search line is ok, set OPENROUTER_WEB_SEARCH=on. If reportedCents and tableCents differ by more than a few percent, the price table needs correcting.",
    };
  },
});
