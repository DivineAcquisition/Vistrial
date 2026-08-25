import { describe, expect, it } from "vitest";

import { previewScoringImpact, scoringPreviewFingerprint, type ScoringPreviewLead } from "@/lib/settings/preview";
import type { FactorValues } from "@/lib/scoring/compute";

const weights = {
  timeline: 35,
  investment_capacity: 30,
  decision_authority: 20,
  pain_severity: 15,
};

const current = {
  ...weights,
  readyThreshold: 70,
  speedToLeadMinutes: 15,
  ghostDaysSoft: 14,
  ghostDaysHard: 30,
};

function factors(partial: Partial<FactorValues>): FactorValues {
  return {
    timeline: null,
    investment_capacity: null,
    decision_authority: null,
    pain_severity: null,
    ...partial,
  };
}

function lead(partial: Partial<ScoringPreviewLead> & { id: string; name: string }): ScoringPreviewLead {
  return {
    currentScore: 80,
    leadType: "ready_track",
    isHoldout: false,
    firstHumanTouchAt: "2026-01-01T12:00:00.000Z",
    lastTouchAt: "2026-01-02T12:00:00.000Z",
    optedInAt: "2026-01-01T10:00:00.000Z",
    nextActionDueAt: null,
    ghostApproachingAt: null,
    status: "working",
    factors: factors({ timeline: 80, investment_capacity: 80, decision_authority: 80, pain_severity: 80 }),
    ...partial,
  };
}

describe("previewScoringImpact", () => {
  it("counts track movers when the ready threshold rises past a lead", () => {
    const leads = [
      lead({
        id: "a",
        name: "Ada Ready",
        currentScore: 72,
        leadType: "ready_track",
        factors: factors({ timeline: 72, investment_capacity: 72, decision_authority: 72, pain_severity: 72 }),
      }),
      lead({
        id: "b",
        name: "Ben Safe",
        currentScore: 90,
        leadType: "ready_track",
        factors: factors({ timeline: 90, investment_capacity: 90, decision_authority: 90, pain_severity: 90 }),
      }),
    ];
    const result = previewScoringImpact({
      leads,
      current,
      proposed: { ...current, readyThreshold: 80 },
    });
    expect(result.trackChanged).toBe(1);
    expect(result.movers.some((row) => row.name === "Ada Ready" && row.toTrack === "nurture_track")).toBe(true);
    expect(result.fingerprint).toBe(scoringPreviewFingerprint({ ...current, readyThreshold: 80 }));
  });

  it("uses the same fingerprint for a sensitivity-only change as a raw threshold change", () => {
    const proposed = { ...current, readyThreshold: 55 };
    expect(scoringPreviewFingerprint(proposed)).toBe("35:30:20:15:55:15:14:30");
  });

  it("does not auto-balance weights — a 40/30/20/15 config is a different preview than 35/30/20/15", () => {
    const leads = [
      lead({
        id: "c",
        name: "Cara",
        currentScore: 80,
        factors: factors({ timeline: 100, investment_capacity: 0, decision_authority: 0, pain_severity: 0 }),
      }),
    ];
    const a = previewScoringImpact({
      leads,
      current,
      proposed: { ...current, timeline: 40, investment_capacity: 30, decision_authority: 20, pain_severity: 10 },
    });
    const b = previewScoringImpact({
      leads,
      current,
      proposed: current,
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("keeps holdout leads on the ready track even below the threshold", () => {
    const leads = [
      lead({
        id: "h",
        name: "Holdout",
        currentScore: 10,
        leadType: "ready_track",
        isHoldout: true,
        factors: factors({ timeline: 10, investment_capacity: 10, decision_authority: 10, pain_severity: 10 }),
      }),
    ];
    const result = previewScoringImpact({
      leads,
      current,
      proposed: { ...current, readyThreshold: 95 },
    });
    expect(result.trackChanged).toBe(0);
    expect(result.readyCount).toBe(1);
  });
});
