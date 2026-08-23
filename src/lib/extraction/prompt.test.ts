import { describe, expect, it } from "vitest";

import { extractionUserPrompt } from "@/lib/extraction/prompt";

describe("extractionUserPrompt", () => {
  it("keeps a plain transcript when no workspace context is passed", () => {
    expect(extractionUserPrompt("Hello from the call", false)).toBe("Transcript:\nHello from the call");
  });

  it("adds the owner's other-channel wording without treating it as a call fact", () => {
    const text = extractionUserPrompt("Hello from the call", false, {
      leadChannels: ["other"],
      leadChannelsOther: "CrossFit gyms",
    });
    expect(text).toContain("CrossFit gyms");
    expect(text).toContain("Do not treat it as facts from this call");
    expect(text).toContain("Transcript:\nHello from the call");
  });

  it("omits empty optional context so existing prompts stay unchanged", () => {
    expect(extractionUserPrompt("Hello from the call", false, { leadChannels: ["facebook"] })).toBe(
      "Transcript:\nHello from the call"
    );
  });
});
