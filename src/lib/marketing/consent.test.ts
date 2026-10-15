import { describe, expect, it } from "vitest";

import {
  categoryAllowed,
  choiceFromMode,
  consentIsCurrent,
  parseConsent,
  rememberSnapshot,
  serializeConsent,
} from "@/lib/marketing/consent";

const now = Date.parse("2026-10-15T12:00:00Z");

describe("cookie consent", () => {
  it("round-trips a choice and keeps optional tools off until accepted", () => {
    const stored = choiceFromMode("accept", 3, false, now);
    const parsed = parseConsent(serializeConsent(stored));
    expect(categoryAllowed({ choice: parsed, category: "analytics", gpc: false, version: 3, now })).toBe(true);
    expect(categoryAllowed({ choice: parsed, category: "advertising", gpc: false, version: 3, now })).toBe(true);
    expect(categoryAllowed({ choice: null, category: "analytics", gpc: false, version: 3, now })).toBe(false);
  });

  it("treats Global Privacy Control as reject unless the visitor deliberately chose", () => {
    const accepted = choiceFromMode("accept", 1, false, now);
    expect(categoryAllowed({ choice: accepted, category: "analytics", gpc: true, version: 1, now })).toBe(false);
    const override = choiceFromMode("accept", 1, true, now);
    expect(override.o).toBe(1);
    expect(categoryAllowed({ choice: override, category: "advertising", gpc: true, version: 1, now })).toBe(true);
  });

  it("expires a closed banner after 30 days and an explicit choice after 12 months", () => {
    const dismissed = choiceFromMode("dismiss", 1, false, now);
    const later = now + 31 * 24 * 60 * 60 * 1000;
    expect(consentIsCurrent(dismissed, 1, now + 10 * 24 * 60 * 60 * 1000)).toBe(true);
    expect(consentIsCurrent(dismissed, 1, later)).toBe(false);
    const rejected = choiceFromMode("reject", 1, false, now);
    expect(consentIsCurrent(rejected, 1, now + 200 * 24 * 60 * 60 * 1000)).toBe(true);
    expect(consentIsCurrent(rejected, 1, now + 366 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(categoryAllowed({ choice: rejected, category: "analytics", gpc: false, version: 1, now })).toBe(false);
  });

  it("returns the same snapshot object until the consent value changes", () => {
    const slot: { key: string; value?: { n: number } } = { key: "" };
    const first = rememberSnapshot(slot, "same", () => ({ n: 1 }));
    const again = rememberSnapshot(slot, "same", () => ({ n: 2 }));
    expect(again).toBe(first);
    const next = rememberSnapshot(slot, "next", () => ({ n: 3 }));
    expect(next).not.toBe(first);
    expect(next.n).toBe(3);
  });

  it("asks again when the consent version changes", () => {
    const stored = choiceFromMode("accept", 1, false, now);
    expect(categoryAllowed({ choice: stored, category: "analytics", gpc: false, version: 2, now })).toBe(false);
  });
});
