import { describe, expect, it } from "vitest";

import { ModelError, complete, completionFromResponse, costCents } from "./modelRouter";

const usage = { input_tokens: 1000, output_tokens: 500 } as never;

function route(model: string, fallbackModel: string) {
  return { provider: "fake", model, fallbackProvider: "fake", fallbackModel };
}

describe("model router cost", () => {
  it("prices a normal answer from usage and the price table", () => {
    const result = completionFromResponse("claude-opus-5-5", {
      content: [{ type: "text", text: "hello", citations: null }] as never,
      stop_reason: "end_turn",
      usage,
    });
    // 1,000 in at $4 and 500 out at $20 per million tokens is $0.014.
    expect(result.costCents).toBe(1.4);
    expect(result.text).toBe("hello");
  });

  it("keeps the billed cost of a refusal on the error", () => {
    let caught: unknown;
    try {
      completionFromResponse("claude-opus-5-5", { content: [], stop_reason: "refusal", usage });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ModelError);
    const error = caught as ModelError;
    expect(error.code).toBe("refused");
    expect(error.retryable).toBe(true);
    expect(error.spent).toEqual({ inputTokens: 1000, outputTokens: 500, costCents: costCents("claude-opus-5-5", 1000, 500) });
    expect(error.spent.costCents).toBe(1.4);
  });

  it("adds a refused first call to the fallback's answer", async () => {
    const result = await complete(route("fake-refusing", "fake-writer"), "write", "x");
    expect(result.model).toBe("fake-writer");
    // fake-refusing bills 2 cents for 10 in and 2 out; fake-writer costs 1 cent for 10 in and 5 out.
    expect(result.costCents).toBe(3);
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(7);
  });

  it("keeps the refused call's cost when the fallback fails too", async () => {
    await expect(complete(route("fake-refusing", "fake-failing"), "write", "x")).rejects.toMatchObject({
      code: "provider_error",
      spent: { inputTokens: 10, outputTokens: 2, costCents: 2 },
    });
  });

  it("keeps the cost when a refusal has no other route to try", async () => {
    await expect(complete(route("fake-refusing", "fake-refusing"), "write", "x")).rejects.toMatchObject({
      code: "refused",
      spent: { costCents: 2 },
    });
  });

  it("adds both refusals when the fallback refuses too", async () => {
    await expect(
      complete({ provider: "fake", model: "fake-refusing", fallbackProvider: "fake", fallbackModel: "fake-refusing-b" }, "write", "x"),
    ).rejects.toMatchObject({ code: "refused", spent: { inputTokens: 20, outputTokens: 4, costCents: 4 } });
  });
});
