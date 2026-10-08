import { describe, expect, it } from "vitest";

import { chatErrorMessage } from "@/lib/sales-os/chat-error";

describe("chatErrorMessage", () => {
  it("reads the sentence out of the API's JSON error", () => {
    expect(chatErrorMessage('{"error":"Vistrial can\'t think right now: the model key isn\'t set for this deployment."}')).toBe(
      "Vistrial can't think right now: the model key isn't set for this deployment."
    );
  });

  it("keeps a short plain sentence", () => {
    expect(chatErrorMessage("Sign in again to keep talking.")).toBe("Sign in again to keep talking.");
  });

  it("does not dump a long body", () => {
    expect(chatErrorMessage("x".repeat(400))).toBe("Something went wrong. Nothing outside Vistrial was changed.");
  });
});
