import { describe, expect, it } from "vitest";

import { findSpokenOptOut } from "@/lib/scribe/optout";
import { splitPassages } from "@/lib/scribe/passages";
import { meetsBar, scoreSample, summarize } from "@/lib/scribe/quality/metrics";
import { QUALITY_SAMPLES, QUALITY_TEMPLATES } from "@/lib/scribe/quality/samples";
import { findSensitive } from "@/lib/scribe/safety";

describe("quality samples", () => {
  it("cover every starting template", () => {
    for (const template of QUALITY_TEMPLATES) expect(QUALITY_SAMPLES[template].length).toBeGreaterThanOrEqual(3);
  });

  it("resolve the prospect in every sample", () => {
    for (const template of QUALITY_TEMPLATES) {
      for (const sample of QUALITY_SAMPLES[template]) {
        const passages = splitPassages(sample.transcript, { prospectNames: [sample.prospect], teamNames: sample.team });
        expect(passages.some((p) => p.speaker === "prospect"), sample.id).toBe(true);
        expect(passages.some((p) => p.speaker === "team"), sample.id).toBe(true);
      }
    }
  });

  it("the deterministic checks catch every expected opt-out and sensitive call, and nothing else", () => {
    for (const template of QUALITY_TEMPLATES) {
      for (const sample of QUALITY_SAMPLES[template]) {
        const passages = splitPassages(sample.transcript, { prospectNames: [sample.prospect], teamNames: sample.team });
        expect(findSpokenOptOut(passages) != null, sample.id).toBe(sample.optOut === true);
        expect(findSensitive(passages).length > 0, sample.id).toBe(sample.sensitive === true);
      }
    }
  });
});

describe("quality metrics", () => {
  const sample = QUALITY_SAMPLES["med-spa"][1];

  it("counts invented facts against the bar", () => {
    const perfect = scoreSample(
      sample,
      [{ key: "treatment_interest", label: "", state: "present", value: "laser hair removal", quote: "x", passageIds: [] }],
      { optOut: false, sensitive: false, quoted: 1, grounded: 1 }
    );
    expect(meetsBar(summarize([perfect]))).toBe(true);
    const invented = scoreSample(
      sample,
      [
        { key: "treatment_interest", label: "", state: "present", value: "laser", quote: "x", passageIds: [] },
        { key: "budget_comfort", label: "", state: "present", value: "$500", quote: "x", passageIds: [] },
        { key: "timeline", label: "", state: "present", value: "soon", quote: "x", passageIds: [] },
      ],
      { optOut: false, sensitive: false, quoted: 3, grounded: 1 }
    );
    const metrics = summarize([invented]);
    expect(metrics.noInvention).toBeLessThan(0.9);
    expect(meetsBar(metrics)).toBe(false);
  });
});
