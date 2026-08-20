import { describe, expect, it } from "vitest";

import { applyEventToFactors, overlayCallFactors } from "@/lib/scoring/events";
import type { FactorValues } from "@/lib/scoring/compute";

const previous: FactorValues = {
  timeline: 80,
  investment_capacity: 70,
  decision_authority: 60,
  pain_severity: 50,
};

describe("overlayCallFactors", () => {
  it("lets the call win where it has a value and keeps the rest", () => {
    const merged = overlayCallFactors(previous, {
      timeline: 40,
      investment_capacity: 90,
      decision_authority: null,
      pain_severity: null,
    });
    expect(merged).toEqual({
      timeline: 40,
      investment_capacity: 90,
      decision_authority: 60,
      pain_severity: 50,
    });
  });
});

describe("applyEventToFactors", () => {
  it("lowers timeline on a no-show and on ghost, raises it on inbound reply", () => {
    expect(applyEventToFactors(previous, "no_show").timelineTo).toBe(55);
    expect(applyEventToFactors(previous, "inbound_reply").timelineTo).toBe(100);
    expect(applyEventToFactors(previous, "ghost").timelineTo).toBe(40);
    expect(applyEventToFactors(previous, "ghost").factors.investment_capacity).toBe(70);
  });

  it("still records a timeline when the previous value was unknown", () => {
    const unknown = { ...previous, timeline: null };
    expect(applyEventToFactors(unknown, "no_show").timelineTo).toBe(35);
    expect(applyEventToFactors(unknown, "inbound_reply").timelineTo).toBe(60);
    expect(applyEventToFactors(unknown, "ghost").timelineTo).toBe(15);
  });
});
