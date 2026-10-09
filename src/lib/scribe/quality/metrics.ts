import type { ExtractedFact } from "@/lib/scribe/merge";
import type { QualitySample } from "@/lib/scribe/quality/samples";

export type SampleScore = {
  id: string;
  expectedPresent: number;
  found: number;
  expectedAbsent: number;
  invented: number;
  quoted: number;
  grounded: number;
  optOutCorrect: boolean;
  sensitiveCorrect: boolean;
};

export type QualityMetrics = {
  samples: number;
  recall: number;
  noInvention: number;
  grounding: number;
  optOutAccuracy: number;
  sensitiveAccuracy: number;
};

export const QUALITY_BAR = { recall: 0.8, noInvention: 0.9, grounding: 0.95, optOutAccuracy: 1, sensitiveAccuracy: 1 };

function contains(value: unknown, needle: string): boolean {
  return String(value ?? "").toLowerCase().includes(needle.toLowerCase());
}

export function scoreSample(
  sample: QualitySample,
  facts: ExtractedFact[],
  detected: { optOut: boolean; sensitive: boolean; grounded: number; quoted: number }
): SampleScore {
  const byKey = new Map(facts.map((f) => [f.key, f]));
  let expectedPresent = 0;
  let found = 0;
  let expectedAbsent = 0;
  let invented = 0;
  for (const [key, want] of Object.entries(sample.expected)) {
    const got = byKey.get(key);
    if (want === "absent") {
      expectedAbsent += 1;
      if (got && got.state === "present") invented += 1;
    } else {
      expectedPresent += 1;
      if (got && got.state === "present" && contains(got.value, want)) found += 1;
    }
  }
  return {
    id: sample.id,
    expectedPresent,
    found,
    expectedAbsent,
    invented,
    quoted: detected.quoted,
    grounded: detected.grounded,
    optOutCorrect: detected.optOut === (sample.optOut === true),
    sensitiveCorrect: detected.sensitive === (sample.sensitive === true),
  };
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : Math.round((a / b) * 1000) / 1000);

export function summarize(scores: SampleScore[]): QualityMetrics {
  const sum = (pick: (s: SampleScore) => number) => scores.reduce((t, s) => t + pick(s), 0);
  return {
    samples: scores.length,
    recall: ratio(sum((s) => s.found), sum((s) => s.expectedPresent)),
    noInvention: ratio(sum((s) => s.expectedAbsent - s.invented), sum((s) => s.expectedAbsent)),
    grounding: ratio(sum((s) => s.grounded), sum((s) => s.quoted)),
    optOutAccuracy: ratio(scores.filter((s) => s.optOutCorrect).length, scores.length),
    sensitiveAccuracy: ratio(scores.filter((s) => s.sensitiveCorrect).length, scores.length),
  };
}

export function meetsBar(metrics: QualityMetrics): boolean {
  return (Object.keys(QUALITY_BAR) as Array<keyof typeof QUALITY_BAR>).every((k) => metrics[k] >= QUALITY_BAR[k]);
}
