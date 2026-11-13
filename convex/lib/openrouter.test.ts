import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cannotRun, cannotRunModel, familyOf, MODELS, modelSpec, parseChoice, routesFor, type Gate } from "./models";
import { ModelError, PRICES, complete } from "./modelRouter";
import { OPENROUTER_FEE, OPENROUTER_ROUTING, openRouterCents, openRouterError, readReply, reportedCents, type OpenRouterReply, type ScriptedOpenRouter } from "./openrouter";
import { completeWithTools } from "./toolRouter";

const SOL = "openai/gpt-6.1-sol";
const TERRA = "openai/gpt-6.1-terra";
const ROUTE = routesFor(modelSpec(SOL)!).write;
/** Every cost through OpenRouter carries its fee. */
const FEE = 1 + OPENROUTER_FEE;

type Body = Record<string, unknown>;
const hook = globalThis as { __vistrialScriptedOpenRouter?: ScriptedOpenRouter };

/** A reply in the shape OpenRouter's Anthropic-format endpoint documents: an Anthropic message, with `cost` in its usage. */
function reply(content: unknown[], extra: { stop?: string; cost?: number | null; searches?: number; model?: string } = {}): OpenRouterReply {
  return {
    status: 200,
    body: {
      id: "gen-1",
      type: "message",
      role: "assistant",
      model: extra.model ?? SOL,
      provider: "Azure",
      content,
      stop_reason: extra.stop ?? "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: extra.searches === undefined ? null : { web_search_requests: extra.searches, web_fetch_requests: 0 },
        ...(extra.cost === null ? {} : { cost: extra.cost ?? 0.0042 }),
      },
    },
  };
}

const text = (value: string) => ({ type: "text", text: value, citations: null });

/** Replays replies in order and keeps every body that was sent. */
function script(...replies: OpenRouterReply[]) {
  const sent: Body[] = [];
  hook.__vistrialScriptedOpenRouter = (body) => {
    sent.push(structuredClone(body));
    const next = replies.shift();
    if (!next) throw new Error("script ran out");
    return next;
  };
  return sent;
}

describe("the OpenRouter provider", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_WEB_SEARCH;
  });
  afterEach(() => {
    delete hook.__vistrialScriptedOpenRouter;
    delete process.env.OPENROUTER_WEB_SEARCH;
  });

  it("does nothing without a key: the call answers no_key and nothing is spent", async () => {
    await expect(completeWithTools({ ...ROUTE, fallbackModel: SOL }, "write", { input: "q" })).rejects.toMatchObject({ code: "no_key", retryable: false, spent: { costCents: 0 } });
    await expect(complete({ ...ROUTE, fallbackModel: SOL }, "write", "q")).rejects.toMatchObject({ code: "no_key" });
  });

  it("sends the routing rules with every request, and the request in Anthropic's shape", async () => {
    const sent = script(reply([text('{"ok":true}')]));
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    const result = await completeWithTools(ROUTE, "write", { system: "Be brief.", input: "Write it", outputSchema: schema });
    expect(sent[0].provider).toEqual({ data_collection: "deny", zdr: true, require_parameters: true });
    expect(sent[0].provider).toEqual(OPENROUTER_ROUTING);
    expect(sent[0].model).toBe(SOL);
    expect(sent[0].system).toBe("Be brief.");
    expect(sent[0].output_config).toEqual({ format: { type: "json_schema", schema } });
    expect(sent[0].tools).toBeUndefined();
    // Nothing that names a customer rides along.
    expect(sent[0].user).toBeUndefined();
    expect(sent[0].metadata).toBeUndefined();
    expect(result.output).toEqual({ ok: true });
    expect(result.provider).toBe("openrouter");
    expect(result.model).toBe(SOL);
  });

  it("charges the cost OpenRouter reports, not the table", async () => {
    script(reply([text("done")], { cost: 0.0042 }));
    const result = await completeWithTools(ROUTE, "write", { input: "q" });
    // $0.0042 is 0.42 cents. The table would have said 1,000 in at $2 and 100 out at $10: 0.3 cents.
    expect(result.costCents).toBeCloseTo(0.42 * FEE, 4);
    expect(result.inputTokens).toBe(1000);
    expect(result.outputTokens).toBe(100);
  });

  it("adds OpenRouter's 5.5% fee to every cost, reported or worked out, in one place", () => {
    expect(OPENROUTER_FEE).toBe(0.055);
    expect(openRouterCents({ cost: 1 }, 7)).toBe(105.5);
    expect(openRouterCents({}, 100)).toBe(105.5);
    // A reported cost of zero is not believed: the price table's figure is used, so the work is still counted.
    expect(openRouterCents({ cost: 0 }, 100)).toBe(105.5);
    expect(reportedCents({ cost: 0, input_tokens: 1000, output_tokens: 100 })).toBeNull();
    expect(reportedCents({ cost: Number.NaN })).toBeNull();
    // The reported figure itself is left as OpenRouter gave it.
    expect(reportedCents({ cost: 1 })).toBe(100);
  });

  it("falls back to the price table when no cost is reported", async () => {
    script(reply([text("done")], { cost: null }));
    const result = await completeWithTools(ROUTE, "write", { input: "q" });
    expect(result.costCents).toBeCloseTo(0.3 * FEE, 4);
    expect(reportedCents({ cost: "0.1" })).toBeNull();
    expect(reportedCents({ cost: -1 })).toBeNull();
    expect(reportedCents(null)).toBeNull();
  });

  it("cannot run a model that has no price", async () => {
    script(reply([text("done")]));
    const route = { provider: "openrouter", model: "openai/gpt-7", fallbackProvider: "openrouter", fallbackModel: "openai/gpt-7" };
    expect(PRICES["openai/gpt-7"]).toBeUndefined();
    await expect(completeWithTools(route, "write", { input: "q" })).rejects.toMatchObject({ code: "unpriced_model", retryable: false });
  });

  it("keeps web search shut until it is switched on, and never offers web fetch", async () => {
    const sent = script(reply([text("done")]));
    await expect(completeWithTools(ROUTE, "research", { input: "q", webSearch: { maxUses: 3 } })).rejects.toMatchObject({ code: "web_search_off", spent: { costCents: 0 } });
    process.env.OPENROUTER_WEB_SEARCH = "on";
    await expect(completeWithTools(ROUTE, "research", { input: "q", webFetch: { maxUses: 1 } })).rejects.toMatchObject({ code: "unsupported_tool", spent: { costCents: 0 } });
    // Neither refusal reached the network.
    expect(sent).toHaveLength(0);
  });

  it("declares web search on the host's own search, with the skill's limit, and reads the pages back", async () => {
    process.env.OPENROUTER_WEB_SEARCH = "on";
    const sent = script(
      reply(
        [
          { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
          { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://example.com/a", title: "Example A", page_age: "2026-10-01", encrypted_content: "x" }] },
          { type: "text", text: "Found it.", citations: [{ type: "web_search_result_location", url: "https://example.com/b", title: "Example B", cited_text: "b", encrypted_index: "x" }] },
        ],
        { searches: 2, cost: 0.03 },
      ),
    );
    const result = await completeWithTools(ROUTE, "research", { input: "q", webSearch: { maxUses: 4, allowedDomains: ["example.com"] } });
    expect(sent[0].tools).toEqual([{ type: "openrouter:web_search", parameters: { engine: "native", max_uses: 4, allowed_domains: ["example.com"] } }]);
    expect(sent[0].stop_server_tools_when).toEqual([{ type: "step_count_is", step_count: 4 }]);
    expect(result.webSearches).toBe(2);
    // A page that came back only as a citation is still a source.
    expect(result.sources.map((row) => row.url)).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(result.citations).toEqual([{ url: "https://example.com/b", title: "Example B", citedText: "b" }]);
    // The reported cost already holds the search fees: they are not added twice.
    expect(result.costCents).toBeCloseTo(3 * FEE, 4);
  });

  it("refuses domain filters on a Google model, whose own search has none", async () => {
    process.env.OPENROUTER_WEB_SEARCH = "on";
    const sent = script(reply([text("done")]));
    const route = { ...routesFor(modelSpec("google/gemini-4-carbon")!).research, fallbackModel: "google/gemini-4-carbon" };
    await expect(completeWithTools(route, "research", { input: "q", webSearch: { maxUses: 2, blockedDomains: ["x.com"] } })).rejects.toMatchObject({ code: "unsupported_tool" });
    expect(sent).toHaveLength(0);
  });

  it("counts a refusal's cost and moves to the family's other model", async () => {
    const sent = script(reply([], { stop: "refusal", cost: 0.001 }), reply([text("done")], { cost: 0.002, model: TERRA }));
    const result = await completeWithTools(ROUTE, "write", { input: "q" });
    expect(sent.map((row) => row.model)).toEqual([SOL, TERRA]);
    expect(result.model).toBe(TERRA);
    expect(result.costCents).toBeCloseTo(0.3 * FEE, 4);
  });

  it("turns errors into codes and keeps none of the provider's words", async () => {
    const secret = "upstream said: customer prompt text";
    const cases: [number, unknown, string, boolean][] = [
      [401, { type: "error", error: { type: "authentication_error", message: secret, error_type: "authentication" } }, "auth_failed", false],
      [402, { type: "error", error: { type: "billing_error", message: secret, error_type: "payment_required" } }, "no_credit", false],
      [403, { type: "error", error: { type: "permission_error", message: secret, error_type: "permission_denied" } }, "blocked", false],
      [403, { type: "error", error: { type: "invalid_request_error", message: secret, error_type: "refusal" } }, "refused", true],
      [403, { type: "error", error: { type: "invalid_request_error", message: secret, error_type: "content_policy_violation" } }, "refused", true],
      [429, { type: "error", error: { type: "rate_limit_error", message: secret, error_type: "rate_limit_exceeded" } }, "rate_limited", true],
      [400, { type: "error", error: { type: "invalid_request_error", message: secret, error_type: "invalid_request" } }, "bad_request", false],
      [503, { type: "error", error: { type: "api_error", message: secret } }, "no_provider", true],
      [404, null, "no_provider", false],
      [502, null, "provider_error", true],
      [529, { error: { message: secret, metadata: { error_type: "provider_overloaded" } } }, "provider_error", true],
    ];
    for (const [status, body, code, retryable] of cases) {
      const error = openRouterError(status, body);
      expect([status, error.code, error.retryable]).toEqual([status, code, retryable]);
      expect(error.message).not.toContain("customer");
    }
    script({ status: 401, body: cases[0][1] });
    const failed = await completeWithTools({ ...ROUTE, fallbackModel: SOL }, "write", { input: "q" }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(ModelError);
    expect(JSON.stringify(failed) + String((failed as Error).message)).not.toContain("customer");
  });

  it("reads an error that arrives with a 200", () => {
    expect(() => readReply({ status: 200, body: { type: "error", error: { type: "api_error", message: "x", error_type: "provider_unavailable" } } })).toThrow(/provider_error/);
    expect(() => readReply({ status: 200, body: { id: "gen-1", error: { code: 429, message: "x" } } })).toThrow(/rate_limited/);
    // A body that is not a message at all is a provider error, never an empty answer.
    expect(() => readReply({ status: 200, body: { id: "gen-1" } })).toThrow(/provider_error/);
    expect(() => readReply({ status: 200, body: null })).toThrow(/provider_error/);
  });

  it("stops on max_tokens and on a full context window, with the cost counted", async () => {
    script(reply([], { stop: "max_tokens", cost: 0.01 }));
    await expect(completeWithTools(ROUTE, "classify", { input: "q" })).rejects.toMatchObject({ code: "max_tokens", spent: { costCents: 1.055 } });
    script(reply([], { stop: "model_context_window_exceeded", cost: 0.01 }));
    await expect(completeWithTools(ROUTE, "classify", { input: "q" })).rejects.toMatchObject({ code: "max_tokens" });
  });

  it("makes a plain call through the same provider", async () => {
    const sent = script(reply([text("hello")], { cost: 0.001 }));
    const result = await complete(ROUTE, "summarize", "Summarize this");
    expect(sent[0].max_tokens).toBe(4000);
    expect(sent[0].provider).toEqual(OPENROUTER_ROUTING);
    expect(result).toMatchObject({ text: "hello", provider: "openrouter", model: SOL, costCents: 0.1055 });
  });
});

describe("families", () => {
  const on: Gate = { openRouter: true, families: ["gpt", "gemini"], webSearch: false };

  it("reads a model's family from its id, and guesses nothing", () => {
    expect(familyOf("claude-opus-5-5")).toBe("claude");
    expect(familyOf("openai/gpt-6.1-sol")).toBe("gpt");
    expect(familyOf("google/gemini-4-carbon")).toBe("gemini");
    expect(familyOf("gemini-nano-banana-2.1")).toBe("gemini");
    expect(familyOf("fake-writer")).toBeNull();
  });

  it("gives every offered model a price, a name, and a companion and fallback inside its family", () => {
    expect(new Set(MODELS.map((row) => row.id)).size).toBe(MODELS.length);
    for (const row of MODELS) {
      expect(PRICES[row.id]).toBeDefined();
      expect(familyOf(row.id)).toBe(row.family);
      expect(row.provider).toBe(row.family === "claude" ? "claude" : "openrouter");
      expect(row.fallback).not.toBe(row.id);
      for (const other of [row.light, row.fallback]) expect(modelSpec(other)?.family).toBe(row.family);
      for (const route of Object.values(routesFor(row))) {
        expect(route.fallbackModel).not.toBe(route.model);
        expect(PRICES[route.model]).toBeDefined();
        expect(PRICES[route.fallbackModel]).toBeDefined();
      }
      // A lighter companion never costs more than the model it works beside.
      expect(PRICES[row.light].output).toBeLessThanOrEqual(PRICES[row.id].output);
    }
  });

  it("runs the chosen model for research and writing and its lighter companion for the rest", () => {
    const routes = routesFor(modelSpec("openai/gpt-6-astra")!);
    expect(routes.research).toEqual({ provider: "openrouter", model: "openai/gpt-6-astra", fallbackProvider: "openrouter", fallbackModel: SOL });
    expect(routes.write).toEqual(routes.research);
    expect(routes.classify).toEqual({ provider: "openrouter", model: TERRA, fallbackProvider: "openrouter", fallbackModel: "openai/gpt-6-astra" });
    expect(routes.summarize).toEqual(routes.classify);
  });

  it("reads a choice as a model id, or a family name from an older record, and nothing else", () => {
    expect(parseChoice(SOL)?.id).toBe(SOL);
    expect(parseChoice("gpt")?.id).toBe(SOL);
    expect(parseChoice("claude")?.id).toBe("claude-opus-5-5");
    expect(parseChoice("gemini")?.id).toBe("google/gemini-4-carbon");
    expect(parseChoice("claude-fable-5-2")).toBeNull();
    expect(parseChoice("openai/gpt-9")).toBeNull();
    expect(parseChoice(undefined)).toBeNull();
  });

  it("offers Claude Haiku 5.5 for work that searches or reads the web only once that has been proven", () => {
    const off: Gate = { openRouter: false, families: [], webSearch: false };
    const haiku = modelSpec("claude-haiku-5-5")!;
    expect(cannotRunModel(haiku, {}, off)).toBeNull();
    expect(cannotRunModel(haiku, { webSearch: true }, off)).toBe("no_web_search");
    expect(cannotRunModel(haiku, { webFetch: true }, off)).toBe("no_web_fetch");
    expect(cannotRunModel(haiku, { webSearch: true, webFetch: true }, { ...off, haikuWeb: true })).toBeNull();
    // Opus and Sonnet are as they were.
    for (const id of ["claude-opus-5-5", "claude-sonnet-5-5"]) expect(cannotRunModel(modelSpec(id)!, { webSearch: true, webFetch: true }, off)).toBeNull();
    // A model's own rule never hides its family's.
    expect(cannotRunModel(modelSpec(SOL)!, { webSearch: true }, off)).toBe("not_switched_on");
  });

  it("says why a family cannot run a piece of work", () => {
    expect(cannotRun("claude", { webSearch: true, webFetch: true }, { openRouter: false, families: [], webSearch: false })).toBeNull();
    expect(cannotRun("gpt", {}, { ...on, openRouter: false })).toBe("not_switched_on");
    expect(cannotRun("gpt", {}, { ...on, families: ["gemini"] })).toBe("not_switched_on");
    expect(cannotRun("gpt", {}, on)).toBeNull();
    expect(cannotRun("gemini", { webSearch: true }, on)).toBe("no_web_search");
    expect(cannotRun("gemini", { webSearch: true }, { ...on, webSearch: true })).toBeNull();
    expect(cannotRun("gpt", { webFetch: true }, { ...on, webSearch: true })).toBe("no_web_fetch");
  });
});
