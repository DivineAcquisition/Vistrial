import { describe, expect, it } from "vitest";

import { goalLine } from "@/lib/profile/goal";
import { matchDisqualifiers } from "@/lib/profile/intake-flags";
import {
  benchmarkLines,
  formatMinutes,
  formatMoney,
  leakFindingLines,
  parseLeakReport,
} from "@/lib/profile/leak";
import { parseBenchmark, parseDefaults, parseCompleteness } from "@/lib/profile/parse";
import { buildSetterFacts } from "@/lib/profile/setter-facts";
import { statusForStage } from "@/lib/profile/stage-mapping";
import { PROFILE_STAGES, firstIncompleteStage, nextStage } from "@/lib/profile/stages";

describe("onboarding stages", () => {
  it("resumes at the first stage nobody has answered", () => {
    const progress = PROFILE_STAGES.map((stage) => ({
      stage,
      completedAt: stage === "connect" || stage === "business" ? "2026-08-01T00:00:00Z" : null,
    }));
    expect(firstIncompleteStage(progress)).toBe("funnel");
  });

  it("treats a fully answered profile as finished", () => {
    const progress = PROFILE_STAGES.map((stage) => ({ stage, completedAt: "2026-08-01T00:00:00Z" }));
    expect(firstIncompleteStage(progress)).toBeNull();
  });

  it("runs out of stages at the end rather than wrapping", () => {
    expect(nextStage("goals")).toBeNull();
    expect(nextStage("connect")).toBe("business");
  });
});

describe("disqualifiers on intake", () => {
  const configured = ["no_budget", "pre_revenue"] as const;

  it("flags an answer that matches a disqualifier the owner named", () => {
    const matches = matchDisqualifiers(
      { budget: "under 1k", timeline: "immediately" },
      [...configured],
      null
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].disqualifier).toBe("no_budget");
    expect(matches[0].field).toBe("budget");
  });

  it("leaves a qualified lead alone", () => {
    expect(matchDisqualifiers({ budget: "25k+" }, [...configured], null)).toEqual([]);
  });

  it("matches the free-text escape the client typed", () => {
    const matches = matchDisqualifiers(
      { industry: "multi level marketing" },
      ["other"],
      "multi level marketing"
    );
    expect(matches).toHaveLength(1);
  });

  it("never matches on an escape too short to mean anything", () => {
    expect(matchDisqualifiers({ industry: "ab" }, ["other"], "ab")).toEqual([]);
  });

  it("ignores disqualifiers with no phrases behind them", () => {
    expect(matchDisqualifiers({ note: "anything" }, ["wrong_industry"], null)).toEqual([]);
  });
});

describe("pipeline stage mapping", () => {
  const meanings = [
    { crmStage: "Booked Call", means: "call_booked" as const },
    { crmStage: "Won", means: "closed_won" as const },
    { crmStage: "Nurture", means: null },
  ];

  it("maps a CRM stage the client explained, ignoring case and padding", () => {
    expect(statusForStage(meanings, "  booked call ")).toBe("call_booked");
  });

  it("refuses to map into closed_won, which follows a payment", () => {
    expect(statusForStage(meanings, "Won")).toBeNull();
  });

  it("returns nothing for a stage with no stated meaning", () => {
    expect(statusForStage(meanings, "Nurture")).toBeNull();
    expect(statusForStage(meanings, "Unknown")).toBeNull();
  });
});

describe("what the setter established", () => {
  it("says plainly where the setter did not get there", () => {
    const facts = buildSetterFacts(
      ["budget_confirmed", "timeline_confirmed", "decision_maker_confirmed"],
      { budget: "15k" },
      (value) => String(value),
      null
    );
    expect(facts).toEqual([
      { label: "Budget", value: "15k" },
      { label: "Timeline", value: "Not established" },
      { label: "Decision maker", value: "Not established" },
    ]);
  });

  it("uses the client's own wording for the escape", () => {
    const facts = buildSetterFacts(["other"], {}, (value) => String(value), "Gym access confirmed");
    expect(facts[0].label).toBe("Gym access confirmed");
  });
});

describe("the reporting headline framed against their goal", () => {
  it("puts their own number beside the measured one", () => {
    const line = goalLine(
      { metric: "clients_per_month", value: 12 },
      { perHundred: 10, leadsInWindow: 200, tooSmall: false }
    );
    expect(line).toContain("12 clients a month");
    expect(line).toContain("20 from 200 matured leads");
  });

  it("declines to compute against too small a sample", () => {
    const line = goalLine(
      { metric: "clients_per_month", value: 12 },
      { perHundred: null, leadsInWindow: 4, tooSmall: true }
    );
    expect(line).toContain("not enough matured leads");
  });

  it("points at the panel that carries the goal rather than guessing", () => {
    expect(goalLine({ metric: "speed_to_lead", value: 15 }, { perHundred: null, leadsInWindow: 0, tooSmall: true }))
      .toContain("coverage panel");
  });
});

describe("Leak Report formatting", () => {
  const payload = {
    basis: "backfill",
    basis_label: "Measured from your own CRM history.",
    generated_at: "2026-08-22T10:00:00Z",
    org_name: "Apex",
    org_slug: "apex",
    profile_version: 4,
    window_start: "2025-08-22T00:00:00Z",
    window_end: "2026-08-22T00:00:00Z",
    missing: [],
    min_sample: 20,
    stated: { close_rate_pct: 10, price_point_cents: 600000, monthly_lead_volume: 35 },
    findings: [
      {
        key: "never_touched",
        title: "Leads that never got a human touch",
        shown: true,
        measured: true,
        rate: { k: 152, n: 420, pct: 36.1, too_small: false, sample_label: "152 of 420" },
        value_estimate_cents: 9120000,
        estimate_basis: "Estimate. 152 untouched leads at the 10 percent close rate.",
        trace: "baseline_leads rows whose first_human_touch_at is null.",
        fix: "Every lead has to land in one working queue.",
        vistrial: "The queue puts anything past your window in an alarm band.",
      },
      {
        key: "where_deals_die",
        title: "Where deals actually die",
        shown: true,
        measured: false,
        sample_n: 0,
        too_small: true,
        rows: [],
        trace: "Not measured. Your CRM history records that deals were lost but not why.",
        fix: "Cause of death has to be captured when the deal dies.",
        vistrial: null,
      },
    ],
    benchmark: { shown: false, plain: "Fewer than 5 comparable businesses." },
  };

  it("keeps every number and the estimate label", () => {
    const report = parseLeakReport(payload);
    expect(report.basis).toBe("backfill");
    expect(report.findings).toHaveLength(2);

    const lines = leakFindingLines(report.findings[0], report.minSample);
    expect(lines[0]).toBe("36.1% (152 of 420)");
    expect(lines).toContain("Estimated value: $91,200.");
    expect(lines.some((line) => line.startsWith("Estimate."))).toBe(true);
    expect(lines).toContain("Fix: Every lead has to land in one working queue.");
  });

  it("says out loud where Vistrial does not address a finding", () => {
    const report = parseLeakReport(payload);
    const lines = leakFindingLines(report.findings[1], report.minSample);
    expect(lines).toContain("Vistrial does not address this one.");
  });

  it("withholds a rate under the minimum sample rather than showing a misleading one", () => {
    const report = parseLeakReport({
      ...payload,
      findings: [
        {
          ...payload.findings[0],
          rate: { k: 3, n: 11, pct: null, too_small: true, sample_label: "3 of 11" },
          value_estimate_cents: null,
          estimate_basis: null,
        },
      ],
    });
    const lines = leakFindingLines(report.findings[0], report.minSample);
    expect(lines[0]).toBe("3 of 11 (under 20, so no rate is shown)");
  });

  it("keeps a profile-only report labelled as stated rather than measured", () => {
    const report = parseLeakReport({ ...payload, basis: "profile_only" });
    expect(report.basis).toBe("profile_only");
  });

  it("formats money and durations for a reader, not a database", () => {
    expect(formatMoney(600000)).toBe("$6,000");
    expect(formatMoney(null)).toBe("—");
    expect(formatMinutes(45)).toBe("45 minutes");
    expect(formatMinutes(180)).toBe("3 hours");
    expect(formatMinutes(4320)).toBe("3 days");
  });
});

describe("benchmarks", () => {
  it("shows nothing and says why below the minimum cohort", () => {
    const benchmark = parseBenchmark({
      shown: false,
      org_count: 0,
      min_cohort: 5,
      rows: [],
      plain: "Fewer than 5 comparable businesses have completed a profile.",
    });
    expect(benchmark.shown).toBe(false);
    expect(benchmarkLines({ shown: false, plain: benchmark.plain })).toEqual([
      "Fewer than 5 comparable businesses have completed a profile.",
    ]);
  });

  it("discloses the cohort size and matching basis alongside every figure", () => {
    const raw = {
      shown: true,
      org_count: 7,
      min_cohort: 5,
      basis: "Matched on offer type, price band and monthly lead volume band. Medians across 7 businesses.",
      rows: [
        {
          metric: "close_rate",
          cohort_median: 13,
          org_count: 7,
          own_value: 10.5,
          own_sample_n: 420,
          own_source: "backfill",
        },
      ],
    };
    const benchmark = parseBenchmark(raw);
    expect(benchmark.orgCount).toBe(7);
    expect(benchmark.rows[0].cohortMedian).toBe(13);

    const lines = benchmarkLines(raw);
    expect(lines[0]).toBe("Close rate: you 10.5%, comparable businesses 13%");
    expect(lines[1]).toContain("7 businesses");
  });
});

describe("profile defaults and completeness", () => {
  it("carries the source and basis of every pre-filled value", () => {
    const defaults = parseDefaults({
      price_point_cents: {
        value: 600000,
        source: "derived",
        basis: "Median value of the won deals in your CRM history",
      },
      offer_type: { value: null, source: "fallback", basis: "Coaching is the most common shape" },
    });
    expect(defaults.price_point_cents.source).toBe("derived");
    expect(defaults.price_point_cents.basis).toContain("CRM history");
    expect(defaults.offer_type.source).toBe("fallback");
  });

  it("falls back to our starting point when a source is not one we know", () => {
    const defaults = parseDefaults({ x: { value: 1, source: "nonsense", basis: "b" } });
    expect(defaults.x.source).toBe("fallback");
  });

  it("names the feature behind every gap", () => {
    const completeness = parseCompleteness({
      score: 40,
      answered: 8,
      total: 20,
      usable_min: 70,
      gaps: [
        {
          field: "price_point_cents",
          stage: "business",
          label: "Price point",
          consumer: "Leak Report value estimates",
        },
      ],
    });
    expect(completeness.score).toBe(40);
    expect(completeness.gaps[0].consumer).toBe("Leak Report value estimates");
  });
});
