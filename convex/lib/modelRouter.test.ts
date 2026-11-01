import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = class extends APIError {};
    static AuthenticationError = class extends APIError {};
    static BadRequestError = class extends APIError {};
    static APIConnectionError = class extends APIError {};
    messages = { create };
  }
  return { default: Anthropic };
});

import { ModelError, claudeComplete, complete } from "./modelRouter";

function reply(stop_reason: string, input_tokens: number, output_tokens: number, text = "") {
  return {
    stop_reason,
    usage: { input_tokens, output_tokens },
    content: text ? [{ type: "text", text }] : [],
  };
}

describe("model router billing", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("prices a normal Claude call from its usage", async () => {
    create.mockResolvedValueOnce(reply("end_turn", 1_000, 500, "hello"));
    const result = await claudeComplete("claude-opus-5-5", "write", "hi");
    // 1,000 x $4/M + 500 x $20/M = $0.014 = 1.4 cents.
    expect(result.costCents).toBe(1.4);
    expect(result.text).toBe("hello");
  });

  it("carries the billed cost of a refusal on the error", async () => {
    create.mockResolvedValueOnce(reply("refusal", 2_000, 100));
    const error = await claudeComplete("claude-opus-5-5", "write", "hi").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelError);
    expect((error as ModelError).code).toBe("refused");
    // 2,000 x $4/M + 100 x $20/M = $0.01 = 1 cent.
    expect((error as ModelError).billed).toEqual({ inputTokens: 2_000, outputTokens: 100, costCents: 1 });
  });

  it("adds the refused call to the fallback's result", async () => {
    create.mockResolvedValueOnce(reply("refusal", 2_000, 100)).mockResolvedValueOnce(reply("end_turn", 1_000, 500, "ok"));
    const result = await complete(
      { provider: "claude", model: "claude-opus-5-5", fallbackProvider: "claude", fallbackModel: "claude-sonnet-5-5" },
      "write",
      "hi",
    );
    // Refused Opus call 1 cent + Sonnet 1,000 x $2/M + 500 x $10/M = 0.7 cents.
    expect(result.costCents).toBe(1.7);
    expect(result.inputTokens).toBe(3_000);
    expect(result.outputTokens).toBe(600);
    expect(result.model).toBe("claude-sonnet-5-5");
  });
});
