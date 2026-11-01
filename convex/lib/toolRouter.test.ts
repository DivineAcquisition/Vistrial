import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { ModelError } from "./modelRouter";
import { WEB_SEARCH_CENTS, completeWithTools, fakeCreate, usageSpend, type CreateMessage, type ToolRequest } from "./toolRouter";

const ROUTE = { provider: "claude", model: "claude-opus-5-5", fallbackProvider: "claude", fallbackModel: "claude-opus-5-5" };

function message(stop: Anthropic.StopReason, content: unknown[], usage: Partial<Anthropic.Usage> = {}): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
      ...usage,
    },
  } as unknown as Anthropic.Message;
}

/** Replays the given responses in order and keeps every request it was sent. */
function script(...responses: (Anthropic.Message | Error)[]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const create: CreateMessage = async (params) => {
    sent.push(structuredClone(params));
    const next = responses.shift();
    if (!next) throw new Error("script ran out");
    if (next instanceof Error) throw next;
    return next;
  };
  return { sent, createFor: () => create };
}

// 1,000 in at $4 and 100 out at $20 per million tokens.
const TOKEN_CENTS = 0.6;

describe("model calls with tools", () => {
  it("declares the current web tools with their limits, and asks for structured output", async () => {
    const { sent, createFor } = script(message("end_turn", [{ type: "text", text: '{"ok":true}', citations: null }]));
    const request: ToolRequest = {
      input: "Find competitors",
      webSearch: { maxUses: 3, allowedDomains: ["example.com"] },
      webFetch: { maxUses: 2, blockedDomains: ["facebook.com"], maxContentTokens: 5000 },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    };
    const result = await completeWithTools(ROUTE, "research", request, createFor);
    expect(sent[0].tools).toEqual([
      { type: "web_search_20260209", name: "web_search", max_uses: 3, allowed_domains: ["example.com"] },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, blocked_domains: ["facebook.com"], max_content_tokens: 5000 },
    ]);
    expect(sent[0].output_config).toEqual({ format: { type: "json_schema", schema: request.outputSchema } });
    expect(result.output).toEqual({ ok: true });
  });

  it("resumes a paused server turn and adds search fees to token cost", async () => {
    const fake = fakeCreate("fake-researcher");
    const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const result = await completeWithTools({ ...ROUTE, provider: "fake", model: "fake-researcher" }, "research", { input: "q", webSearch: { maxUses: 5 }, outputSchema: {} }, () => async (params) => {
      requests.push(structuredClone(params));
      return fake(params);
    });
    expect(result.turns).toBe(2);
    // The paused turn goes back as the assistant's turn, with no extra user text.
    expect(requests[1].messages.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(result.webSearches).toBe(2);
    // Each fake turn is 100 in / 20 out at Opus rates (0.08 cents), plus one search each.
    expect(result.costCents).toBeCloseTo(2 * 0.08 + 2 * WEB_SEARCH_CENTS, 6);
    expect(result.sources).toEqual([{ url: "https://example.com/a", title: "Example A", pageAge: "2026-10-01" }]);
    expect(result.citations).toEqual([{ url: "https://example.com/a", title: "Example A", citedText: "a" }]);
    expect(result.output).toEqual({ summary: "ok", urls: ["https://example.com/a"] });
  });

  it("runs only declared client tools and reports failures without detail", async () => {
    const { sent, createFor } = script(
      message("tool_use", [
        { type: "tool_use", id: "t1", name: "lookup", input: { key: "a" } },
        { type: "tool_use", id: "t2", name: "asset.addVersion", input: {} },
        { type: "tool_use", id: "t3", name: "broken", input: {} },
      ]),
      message("end_turn", [{ type: "text", text: "done", citations: null }]),
    );
    const seen: unknown[] = [];
    const result = await completeWithTools(
      ROUTE,
      "research",
      {
        input: "q",
        clientTools: [
          { name: "lookup", description: "Look up", inputSchema: { type: "object" }, run: async (input) => (seen.push(input), "found") },
          { name: "broken", description: "Fails", inputSchema: { type: "object" }, run: async () => { throw new Error("secret page text"); } },
        ],
      },
      createFor,
    );
    expect(seen).toEqual([{ key: "a" }]);
    expect(sent[1].messages[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "found" },
        { type: "tool_result", tool_use_id: "t2", is_error: true, content: "Not a declared tool." },
        { type: "tool_result", tool_use_id: "t3", is_error: true, content: "The tool failed." },
      ],
    });
    expect(JSON.stringify(sent)).not.toContain("secret page text");
    expect(result.text).toBe("done");
    expect(result.costCents).toBeCloseTo(2 * TOKEN_CENTS, 6);
  });

  it("keeps the cost of a refusal, search fees included", async () => {
    const { createFor } = script(message("refusal", [], { server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 } }));
    await expect(completeWithTools(ROUTE, "research", { input: "q", webSearch: { maxUses: 5 } }, createFor)).rejects.toMatchObject({
      code: "refused",
      spent: { inputTokens: 1000, outputTokens: 100, costCents: TOKEN_CENTS + 2 * WEB_SEARCH_CENTS },
    });
  });

  it("retries output that does not parse once, counting both attempts", async () => {
    const bad = () => message("end_turn", [{ type: "text", text: "{oops", citations: null }]);
    const good = message("end_turn", [{ type: "text", text: '{"a":1}', citations: null }]);
    const fixed = await completeWithTools(ROUTE, "classify", { input: "q", outputSchema: {} }, script(bad(), good).createFor);
    expect(fixed.output).toEqual({ a: 1 });
    expect(fixed.costCents).toBeCloseTo(2 * TOKEN_CENTS, 6);
    await expect(completeWithTools(ROUTE, "classify", { input: "q", outputSchema: {} }, script(bad(), bad()).createFor)).rejects.toMatchObject({
      code: "invalid_output",
      spent: { costCents: 2 * TOKEN_CENTS },
    });
  });

  it("stops after too many turns, and on max_tokens, keeping the cost", async () => {
    const paused = () => message("pause_turn", []);
    await expect(
      completeWithTools(ROUTE, "research", { input: "q", maxTurns: 2 }, script(paused(), paused()).createFor),
    ).rejects.toMatchObject({ code: "too_many_turns", spent: { costCents: 2 * TOKEN_CENTS } });
    await expect(completeWithTools(ROUTE, "research", { input: "q" }, script(message("max_tokens", [])).createFor)).rejects.toMatchObject({
      code: "max_tokens",
      spent: { costCents: TOKEN_CENTS },
    });
  });

  it("moves to the fallback on a retryable failure and carries what was spent", async () => {
    const route = { ...ROUTE, fallbackModel: "claude-sonnet-5-5" };
    const calls: string[] = [];
    const result = await completeWithTools(route, "research", { input: "q" }, (_provider, model) => async () => {
      calls.push(model);
      if (model === "claude-opus-5-5") return message("refusal", []);
      return message("end_turn", [{ type: "text", text: "fine", citations: null }]);
    });
    expect(calls).toEqual(["claude-opus-5-5", "claude-sonnet-5-5"]);
    expect(result.model).toBe("claude-sonnet-5-5");
    // Opus refusal at Opus rates, plus the Sonnet answer at $2 / $10 per million.
    expect(result.costCents).toBeCloseTo(TOKEN_CENTS + 0.3, 6);
  });

  it("maps provider errors to codes and never runs an unpriced model", async () => {
    const error = new ModelError("rate_limited", true);
    await expect(completeWithTools(ROUTE, "research", { input: "q" }, script(error, error).createFor)).rejects.toMatchObject({ code: "rate_limited" });
    await expect(completeWithTools({ ...ROUTE, model: "claude-unknown" }, "research", { input: "q" })).rejects.toMatchObject({
      code: expect.stringMatching(/unpriced_model|no_key/),
    });
  });

  it("prices cache tokens", () => {
    const used = usageSpend("claude-opus-5-5", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      server_tool_use: { web_search_requests: 3, web_fetch_requests: 0 },
    } as Anthropic.Usage);
    // $5 to write (1.25 x $4), $0.20 to read, plus 3 searches.
    expect(used.spent.costCents).toBeCloseTo(520 + 3, 6);
    expect(used.webSearches).toBe(3);
  });
});
