import Anthropic from "@anthropic-ai/sdk";

import { MAX_TOKENS, ModelError, NO_SPEND, PRICES, addSpend, ratesFor, toModelError, type ModelRoute, type Spend } from "./modelRouter";
import { openRouterCreate, openRouterToolBudget, openRouterWebSearchOn, openRouterCents, openRouterWebSearchTool } from "./openrouter";
import type { WorkKind } from "./registry";

/**
 * Model calls that use tools: Claude's server tools (web search, web fetch), our own client tools, and
 * structured output. Every call is counted, including the ones that fail or are refused, and server
 * tool fees are added to token cost. Page text never leaves this module except as the model's own
 * output and as short, attributed citations.
 */

/** Anthropic's web search is $10 per 1,000 searches; another model's own search has its fee in PRICES. Web fetch has no fee; fetched pages count as input tokens. */
export const WEB_SEARCH_CENTS = 1;

/** Server-side tool loops and client tool round trips one call may take before it stops. */
export const DEFAULT_MAX_TURNS = 8;

export type WebToolConfig = {
  maxUses: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
};

export type ClientTool = {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  /** Runs inside the action. Return text for the model; throw to report a failure without detail. */
  run(input: unknown): Promise<string>;
};

export type ToolRequest = {
  system?: string;
  input: string;
  webSearch?: WebToolConfig;
  webFetch?: WebToolConfig & { maxContentTokens?: number };
  clientTools?: ClientTool[];
  /** JSON schema for the final answer. The answer must parse, or the call is retried once and then fails. */
  outputSchema?: Record<string, unknown>;
  maxTurns?: number;
  /** Images and documents sent with the input, before it. */
  attachments?: Anthropic.ContentBlockParam[];
};

export type FoundSource = { url: string; title: string | null; pageAge: string | null };

export type Citation = { url: string; title: string | null; citedText: string };

export type ToolCompletion = {
  text: string;
  /** The parsed answer when `outputSchema` was set. */
  output: unknown;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  webSearches: number;
  webFetches: number;
  /** Every search result and fetched page, once per URL. */
  sources: FoundSource[];
  citations: Citation[];
  turns: number;
  provider: string;
  model: string;
};

/** The one network call. Tests and the fake provider swap it for a scripted one. */
export type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

type Tally = { spent: Spend; webSearches: number; webFetches: number };

function priceOf(model: string) {
  const price = PRICES[model] ?? (model.startsWith("fake") ? PRICES["claude-opus-5-5"] : undefined);
  if (!price) throw new ModelError("unpriced_model", false);
  return price;
}

/**
 * What one response cost. Through OpenRouter it is the cost OpenRouter reports for the request, which
 * already holds search fees, plus OpenRouter's own fee (`openRouterCents`). Otherwise, and when OpenRouter
 * reports none, it is worked out from the price table: tokens at the model's rates, cache tokens, and
 * search fees.
 */
export function usageSpend(model: string, usage: Anthropic.Usage, provider = "claude"): { spent: Spend; webSearches: number; webFetches: number } {
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const price = ratesFor(priceOf(model), usage.input_tokens + cacheWrite + cacheRead);
  const webSearches = usage.server_tool_use?.web_search_requests ?? 0;
  const webFetches = usage.server_tool_use?.web_fetch_requests ?? 0;
  const dollars =
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      cacheWrite * (price.cacheWrite ?? price.input * 1.25) +
      cacheRead * price.cacheRead) /
    1_000_000;
  const tokenCents = Math.round(dollars * 100 * 10_000) / 10_000;
  const tableCents = tokenCents + webSearches * (price.searchCents ?? WEB_SEARCH_CENTS);
  return {
    spent: {
      inputTokens: usage.input_tokens + cacheWrite + cacheRead,
      outputTokens: usage.output_tokens,
      costCents: provider === "openrouter" ? openRouterCents(usage, tableCents) : tableCents,
    },
    webSearches,
    webFetches,
  };
}

function toolList(request: ToolRequest, provider: string, model: string): Anthropic.Messages.ToolUnion[] {
  const tools: Anthropic.Messages.ToolUnion[] = [];
  if (request.webSearch && provider === "openrouter") {
    // OpenRouter's own search tool, on the model host's search. Its shape is not one of Anthropic's tool types.
    tools.push(openRouterWebSearchTool(model, request.webSearch) as unknown as Anthropic.Messages.ToolUnion);
  } else if (request.webSearch) {
    tools.push({
      type: "web_search_20260209",
      name: "web_search",
      max_uses: request.webSearch.maxUses,
      ...(request.webSearch.allowedDomains ? { allowed_domains: request.webSearch.allowedDomains } : {}),
      ...(request.webSearch.blockedDomains ? { blocked_domains: request.webSearch.blockedDomains } : {}),
    });
  }
  if (request.webFetch) {
    tools.push({
      type: "web_fetch_20260209",
      name: "web_fetch",
      max_uses: request.webFetch.maxUses,
      ...(request.webFetch.allowedDomains ? { allowed_domains: request.webFetch.allowedDomains } : {}),
      ...(request.webFetch.blockedDomains ? { blocked_domains: request.webFetch.blockedDomains } : {}),
      ...(request.webFetch.maxContentTokens ? { max_content_tokens: request.webFetch.maxContentTokens } : {}),
    });
  }
  for (const tool of request.clientTools ?? []) {
    tools.push({ name: tool.name, description: tool.description, input_schema: tool.inputSchema });
  }
  return tools;
}

/** Reads the pages a web tool found, and the lines the model cited, out of one response. Exported for the provider check. */
export function collect(content: Anthropic.ContentBlock[], sources: Map<string, FoundSource>, citations: Citation[]) {
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (!sources.has(result.url)) sources.set(result.url, { url: result.url, title: result.title ?? null, pageAge: result.page_age ?? null });
      }
    }
    if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      const url = block.content.url;
      if (!sources.has(url)) {
        const title = block.content.content.title ?? null;
        sources.set(url, { url, title, pageAge: block.content.retrieved_at ?? null });
      }
    }
    if (block.type === "text") {
      for (const citation of block.citations ?? []) {
        if (citation.type === "web_search_result_location") {
          citations.push({ url: citation.url, title: citation.title ?? null, citedText: citation.cited_text });
          // A host that returns its search results only as citations still names every page it used.
          if (!sources.has(citation.url)) sources.set(citation.url, { url: citation.url, title: citation.title ?? null, pageAge: null });
        }
      }
    }
  }
}

/** One attempt: the request, then as many turns as server pauses and client tools need. */
async function attempt(
  create: CreateMessage,
  provider: string,
  model: string,
  workKind: WorkKind,
  request: ToolRequest,
  tally: Tally,
): Promise<ToolCompletion> {
  const tools = toolList(request, provider, model);
  const budget = provider === "openrouter" && request.webSearch ? openRouterToolBudget(request.webSearch.maxUses) : {};
  const declared = new Map((request.clientTools ?? []).map((tool) => [tool.name, tool]));
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: request.attachments?.length ? [...request.attachments, { type: "text", text: request.input }] : request.input },
  ];
  const sources = new Map<string, FoundSource>();
  const citations: Citation[] = [];
  const maxTurns = request.maxTurns ?? DEFAULT_MAX_TURNS;

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    let response: Anthropic.Message;
    try {
      response = await create({
        model,
        max_tokens: MAX_TOKENS[workKind],
        ...(request.system ? { system: request.system } : {}),
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        ...(request.outputSchema ? { output_config: { format: { type: "json_schema", schema: request.outputSchema } } } : {}),
        ...budget,
      });
    } catch (error) {
      throw toModelError(error, tally.spent);
    }
    const used = usageSpend(model, response.usage, provider);
    tally.spent = addSpend(tally.spent, used.spent);
    tally.webSearches += used.webSearches;
    tally.webFetches += used.webFetches;
    collect(response.content, sources, citations);

    if (response.stop_reason === "refusal") throw new ModelError("refused", true, tally.spent);
    if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") throw new ModelError("max_tokens", false, tally.spent);
    if (response.stop_reason === "pause_turn") {
      // The server stopped its own tool loop. Sending the turn back resumes it; no extra user text.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "tool_use") {
      const calls = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const tool = declared.get(call.name);
        // Only declared tools run. A name the model made up gets an error result, never a call.
        if (!tool) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Not a declared tool." });
          continue;
        }
        try {
          results.push({ type: "tool_result", tool_use_id: call.id, content: await tool.run(call.input) });
        } catch {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: "The tool failed." });
        }
      }
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: results });
      continue;
    }

    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    let output: unknown = null;
    if (request.outputSchema) {
      try {
        output = JSON.parse(text);
      } catch {
        throw new ModelError("invalid_output", false, tally.spent);
      }
    }
    return {
      text,
      output,
      ...tally.spent,
      webSearches: tally.webSearches,
      webFetches: tally.webFetches,
      sources: [...sources.values()],
      citations,
      turns: turn,
      provider,
      model,
    };
  }
  throw new ModelError("too_many_turns", false, tally.spent);
}

/** A model call with tools. Output that does not parse is retried once, then the call fails. */
async function callWithTools(
  provider: string,
  model: string,
  workKind: WorkKind,
  request: ToolRequest,
  create: CreateMessage,
): Promise<ToolCompletion> {
  const tally: Tally = { spent: NO_SPEND, webSearches: 0, webFetches: 0 };
  if (provider === "openrouter") {
    // Refused before any call, so nothing is spent. No model there reads a web page itself, and web search
    // stays off until a real call has shown its results come back (lib/openrouter.ts).
    if (request.webFetch) throw new ModelError("unsupported_tool", false);
    if (request.webSearch && !openRouterWebSearchOn()) throw new ModelError("web_search_off", false);
  }
  try {
    return await attempt(create, provider, model, workKind, request, tally);
  } catch (error) {
    if (!(error instanceof ModelError) || error.code !== "invalid_output") throw error;
    return attempt(create, provider, model, workKind, request, tally);
  }
}

function clientFor(provider: string, model: string): CreateMessage {
  if (provider === "fake") return fakeCreate(model);
  if (provider === "openrouter") return openRouterCreate(model);
  if (provider !== "claude") throw new ModelError("unknown_provider", false);
  if (!process.env.ANTHROPIC_API_KEY) throw new ModelError("no_key", false);
  if (!PRICES[model]) throw new ModelError("unpriced_model", false);
  const client = new Anthropic();
  return (params) => client.messages.create(params);
}

/**
 * Same contract as `complete`: the route picks the model, the fallback takes over on a retryable
 * failure, and whatever a failed attempt was billed is carried into the result or the error.
 */
export async function completeWithTools(
  route: ModelRoute,
  workKind: WorkKind,
  request: ToolRequest,
  createFor: (provider: string, model: string) => CreateMessage = clientFor,
): Promise<ToolCompletion> {
  try {
    return await callWithTools(route.provider, route.model, workKind, request, createFor(route.provider, route.model));
  } catch (error) {
    const sameRoute = route.fallbackProvider === route.provider && route.fallbackModel === route.model;
    if (!(error instanceof ModelError) || !error.retryable || sameRoute) throw error;
    const spent = error.spent;
    try {
      const result = await callWithTools(
        route.fallbackProvider,
        route.fallbackModel,
        workKind,
        request,
        createFor(route.fallbackProvider, route.fallbackModel),
      );
      return { ...result, ...addSpend(result, spent) };
    } catch (fallbackError) {
      throw toModelError(fallbackError, spent);
    }
  }
}

// ---------- Fake provider: scripted responses through the same loop ----------

type FakeTurn = { stop: Anthropic.StopReason; content: unknown[]; searches?: number; fetches?: number };

function fakeMessage(model: string, turn: FakeTurn): Anthropic.Message {
  return {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model,
    content: turn.content,
    stop_reason: turn.stop,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: turn.searches ?? 0, web_fetch_requests: turn.fetches ?? 0 },
    },
  } as unknown as Anthropic.Message;
}

const FAKE_SEARCH_RESULT = {
  type: "web_search_tool_result",
  tool_use_id: "srvtoolu_fake",
  content: [{ type: "web_search_result", url: "https://example.com/a", title: "Example A", page_age: "2026-10-01", encrypted_content: "x" }],
};

/** A researcher that searches, pauses once, searches again, then answers in JSON. */
/**
 * Tests script answers per call with this hook, used only by the "fake-scripted" model. Nothing in the
 * product sets it, and the fake provider itself runs only where dev skills are on or a test sets a route.
 */
export type ScriptedModel = (params: Anthropic.MessageCreateParamsNonStreaming) => { text: string; searches?: number; sources?: { url: string; title: string; pageAge?: string }[] };

export function fakeCreate(model: string): CreateMessage {
  let calls = 0;
  const scripted = (globalThis as { __vistrialScriptedModel?: ScriptedModel }).__vistrialScriptedModel;
  if (model === "fake-scripted" && scripted) {
    return async (params) => {
      const reply = scripted(params);
      const results = (reply.sources ?? []).map((row) => ({ type: "web_search_result", url: row.url, title: row.title, page_age: row.pageAge ?? null, encrypted_content: "x" }));
      return fakeMessage(model, {
        stop: "end_turn",
        searches: reply.searches ?? 0,
        content: [
          ...(results.length ? [{ type: "server_tool_use", id: "srvtoolu_s", name: "web_search", input: { query: "q" } }, { type: "web_search_tool_result", tool_use_id: "srvtoolu_s", content: results }] : []),
          { type: "text", text: reply.text, citations: null },
        ],
      });
    };
  }
  return async () => {
    calls += 1;
    if (model === "fake-tool-refusing") return fakeMessage(model, { stop: "refusal", content: [], searches: 1 });
    if (model === "fake-tool-bad-json") return fakeMessage(model, { stop: "end_turn", content: [{ type: "text", text: "not json", citations: null }] });
    if (calls === 1) {
      return fakeMessage(model, {
        stop: "pause_turn",
        searches: 1,
        content: [{ type: "server_tool_use", id: "srvtoolu_fake", name: "web_search", input: { query: "q" } }, FAKE_SEARCH_RESULT],
      });
    }
    return fakeMessage(model, {
      stop: "end_turn",
      searches: 1,
      content: [
        {
          type: "text",
          text: JSON.stringify({ summary: "ok", urls: ["https://example.com/a"] }),
          citations: [{ type: "web_search_result_location", url: "https://example.com/a", title: "Example A", cited_text: "a", encrypted_index: "x" }],
        },
      ],
    });
  };
}
