import { describe, expect, it } from "vitest";

import { aiLines, glanceCards, neverDo, underTheHood } from "@/lib/trust/security-copy";
import { snapshotHasNoInternalAddress, TRUST_FALLBACK } from "@/lib/trust/model";

const off = TRUST_FALLBACK.switches;

describe("security copy stays inside verified behavior", () => {
  const blob = JSON.stringify({
    cards: glanceCards(off),
    never: neverDo(off),
    ai: aiLines(off),
    hood: underTheHood(off),
  });

  it("hides switch lines until they are turned on", () => {
    expect(blob).not.toMatch(/train/i);
    expect(blob).not.toMatch(/at rest/i);
    expect(blob).not.toMatch(/backup/i);
    expect(blob).not.toMatch(/sell your data/i);
    expect(blob).not.toMatch(/multi-factor/i);
    expect(aiLines({ ...off, aiNoTraining: true }).join(" ")).toMatch(/not used to train/i);
    expect(neverDo({ ...off, noSell: true })).toContain("Sell your data.");
  });

  it("does not use an em dash or name an unlisted firm", () => {
    expect(blob).not.toContain("\u2014");
    expect(blob).not.toMatch(/divine acquisition/i);
  });
});

describe("public trust snapshot", () => {
  it("does not carry an internal mailbox field", () => {
    expect(snapshotHasNoInternalAddress({ security_email: "contact@vistrial.io", privacy_live: false })).toBe(true);
    expect(snapshotHasNoInternalAddress({ internal_forward_email: "hidden@example.com" })).toBe(false);
  });
});
