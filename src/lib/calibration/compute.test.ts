import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  bandLabel,
  causationCopy,
  curveBreaks,
  isMonotonicIncreasing,
  scoreBandKey,
  steepestStep,
  type BandRate,
} from "@/lib/calibration/compute";
import {
  CALIBRATION_HONESTY,
  CALIBRATION_MIN_N,
  HOLDOUT_DISABLED_PLAIN,
  HOLDOUT_PLAIN,
} from "@/lib/calibration/constants";

function band(key: string, n: number, closed: number, tooSmall = n < CALIBRATION_MIN_N): BandRate {
  return { key, n, closed, closeRate: n > 0 ? closed / n : null, tooSmall };
}

describe("score bands", () => {
  it("puts 60 on the 60–79 boundary and 100 in the top band", () => {
    expect(scoreBandKey(0)).toBe("0-19");
    expect(scoreBandKey(19)).toBe("0-19");
    expect(scoreBandKey(20)).toBe("20-39");
    expect(scoreBandKey(59)).toBe("40-59");
    expect(scoreBandKey(60)).toBe("60-79");
    expect(scoreBandKey(79)).toBe("60-79");
    expect(scoreBandKey(80)).toBe("80-100");
    expect(scoreBandKey(100)).toBe("80-100");
    expect(scoreBandKey(null)).toBeNull();
    expect(bandLabel("40-59")).toBe("40–59");
  });
});

describe("calibration curve", () => {
  const well: BandRate[] = [
    band("0-19", 25, 5),
    band("20-39", 4, 1, true),
    band("80-100", 25, 20),
  ];

  it("is monotonic when each shown band closes at least as well as the one below", () => {
    expect(isMonotonicIncreasing(well)).toBe(true);
    expect(curveBreaks(well)).toEqual([]);
  });

  it("names a reversal when a higher band closes less often", () => {
    const reversed = [band("0-19", 25, 20), band("80-100", 25, 5)];
    expect(isMonotonicIncreasing(reversed)).toBe(false);
    expect(curveBreaks(reversed)).toEqual([
      {
        kind: "reversal",
        fromKey: "0-19",
        toKey: "80-100",
        fromRate: 0.8,
        toRate: 0.2,
      },
    ]);
  });

  it("names a flat stretch in the range where most leads sit", () => {
    const flat = [band("40-59", 40, 16), band("60-79", 40, 16)];
    expect(curveBreaks(flat)[0]).toMatchObject({ kind: "flat", fromKey: "40-59", toKey: "60-79" });
  });

  it("places the steepest step at the lower edge of the higher band", () => {
    const step = steepestStep(well);
    expect(step).toMatchObject({
      fromKey: "0-19",
      toKey: "80-100",
      suggestedThreshold: 80,
    });
    expect(step?.jump).toBeCloseTo(0.6);
  });

  it("does not treat a six-lead band as a rate", () => {
    const tiny = [band("0-19", 6, 3, true), band("80-100", 25, 20)];
    expect(isMonotonicIncreasing(tiny)).toBe(false);
    expect(curveBreaks(tiny)).toEqual([]);
  });
});

describe("honesty", () => {
  it("rejects copy that says the product caused a close", () => {
    expect(causationCopy("Vistrial closed more of the high-scoring leads.")).toBe(true);
    expect(causationCopy("The score caused them to close.")).toBe(true);
    expect(causationCopy(CALIBRATION_HONESTY)).toBe(false);
    expect(causationCopy(HOLDOUT_PLAIN)).toBe(false);
    expect(causationCopy(HOLDOUT_DISABLED_PLAIN)).toBe(false);
    expect(
      causationCopy(
        "A higher score among leads that closed is association, not proof the score caused the close."
      )
    ).toBe(false);
  });
});

describe("the calibration job never writes live scoring config", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20260826010000_calibration.sql"),
    "utf8"
  );

  it("keeps refresh_calibration_suggestions from writing score_configs", () => {
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.refresh_calibration_suggestions");
    const end = sql.indexOf("CREATE OR REPLACE FUNCTION public.save_org_score_config");
    const body = sql.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(body).not.toMatch(/update\s+public\.score_configs/i);
    expect(body).not.toMatch(/update\s+score_configs/i);
    expect(body).toMatch(/insert into public\.calibration_suggestions/i);
  });

  it("does not call save_org_score_config from the cron job", () => {
    const jobs = readFileSync(join(process.cwd(), "src/lib/calibration/jobs.ts"), "utf8");
    expect(jobs).toMatch(/refresh_calibration_suggestions/);
    expect(jobs).toMatch(/run_extraction_sample_audit/);
    expect(jobs).not.toMatch(/save_org_score_config/);
    expect(jobs).not.toMatch(/apply_calibration_suggestion/);
  });

  it("applies config only through the owner/admin save path", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.save_org_score_config/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.apply_calibration_suggestion/);
    const applyStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.apply_calibration_suggestion");
    const applyEnd = sql.indexOf("CREATE OR REPLACE FUNCTION public.dismiss_calibration_suggestion");
    const applyBody = sql.slice(applyStart, applyEnd);
    expect(applyBody).toMatch(/save_org_score_config/);
    expect(applyBody).toMatch(/readiness_scores/);
    expect(applyBody).toMatch(/must not write score history/);
  });
});
