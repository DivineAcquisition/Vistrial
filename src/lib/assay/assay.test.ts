import { describe, expect, it } from "vitest";

import { computeAssayScore, type AssayActivity, type AssayInput, type SignalReading } from "@/lib/assay/compute";
import { APPROVED_INPUTS, BLOCKED_INPUT_TERMS, checkFieldMap, isBlockedFieldName } from "@/lib/assay/inputs";
import { parseRules, type AssayRules } from "@/lib/assay/rules";
import { ASSAY_COACHES, ASSAY_HOME_SERVICES, ASSAY_MED_SPA, ASSAY_PLATFORM_DEFAULTS, ASSAY_TEMPLATE_VALUES } from "@/lib/assay/templates";
import { rawTier, stickyTier } from "@/lib/assay/tiers";
import { SEED_TEMPLATES } from "@/lib/config/seeds";

const NOW = "2026-10-19T12:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;

function ago(days: number, from = NOW): string {
  return new Date(Date.parse(from) - days * DAY).toISOString();
}

function later(days: number, from = NOW): string {
  return new Date(Date.parse(from) + days * DAY).toISOString();
}

function rulesFor(values: Record<string, unknown>): AssayRules {
  const { rules, problems } = parseRules(values);
  expect(problems).toEqual([]);
  return rules;
}

const HOME = rulesFor(ASSAY_HOME_SERVICES);

function lead(over: Partial<AssayInput> = {}): AssayInput {
  return {
    leadId: "lead-1",
    fields: { contact_complete: true, service_offered: true, in_service_area: true },
    activities: [],
    teamTouches: [],
    calls: { held: 0, pending: false },
    signals: [],
    source: null,
    ...over,
  };
}

function act(event: AssayActivity["event"], at: string, id = `${event}-${at}`): AssayActivity {
  return { id, event, at };
}

function signal(over: Partial<SignalReading> & Pick<SignalReading, "signal" | "value">): SignalReading {
  return { callId: "call-1", at: ago(1), confidence: "high", passageIds: ["p1"], ...over };
}

describe("seeded rules", () => {
  it("parse cleanly for the platform and every template", () => {
    for (const values of [ASSAY_PLATFORM_DEFAULTS, ...Object.values(ASSAY_TEMPLATE_VALUES)]) {
      rulesFor(values);
    }
  });

  it("are merged into every seeded configuration template", () => {
    for (const template of SEED_TEMPLATES) {
      expect(template.values["assay.fit_rules"], template.slug).toEqual(ASSAY_TEMPLATE_VALUES[template.slug]["assay.fit_rules"]);
    }
  });

  it("use the approved weights", () => {
    expect(rulesFor(ASSAY_HOME_SERVICES).weights).toEqual({ fit: 35, engagement: 45, call: 20 });
    expect(rulesFor(ASSAY_MED_SPA).weights).toEqual({ fit: 35, engagement: 45, call: 20 });
    expect(rulesFor(ASSAY_COACHES).weights).toEqual({ fit: 30, engagement: 40, call: 30 });
  });

  it("use the approved decay and quiet days", () => {
    expect([ASSAY_HOME_SERVICES, ASSAY_MED_SPA, ASSAY_COACHES].map((values) => values["assay.decay_half_life_days"])).toEqual([7, 10, 14]);
    expect([ASSAY_HOME_SERVICES, ASSAY_MED_SPA, ASSAY_COACHES].map((values) => values["assay.going_quiet_days"])).toEqual([3, 4, 5]);
    expect(ASSAY_HOME_SERVICES["assay.trigger_big_jump"]).toBe(false);
  });

  it("read only approved inputs, and never an age, income, or health field", () => {
    const approved = new Set<string>(APPROVED_INPUTS.map((input) => input.key));
    for (const values of [ASSAY_PLATFORM_DEFAULTS, ...Object.values(ASSAY_TEMPLATE_VALUES)]) {
      const rules = rulesFor(values);
      for (const rule of rules.fit) expect(approved.has(rule.input)).toBe(true);
      for (const entry of rules.fieldMap) expect(isBlockedFieldName(entry.source)).toBe(false);
      expect(JSON.stringify(values)).not.toMatch(/\b(age|income|salary|health|medical|investment_capacity)\b/i);
    }
  });
});

describe("fairness", () => {
  it("no approved input is a protected attribute or a stand-in for one", () => {
    for (const input of APPROVED_INPUTS) {
      expect(isBlockedFieldName(input.key), input.key).toBe(false);
    }
  });

  it("rejects protected fields, names, zip code alone, income, and the Med Spa age rule", () => {
    for (const name of [
      "first_name",
      "lastName",
      "gender",
      "age",
      "date_of_birth",
      "race",
      "ethnicity",
      "religion",
      "preferred_language",
      "disability",
      "zip",
      "zip_code",
      "postalCode",
      "household_income",
      "salary",
      "health_conditions",
      "minimum_age",
      "below_minimum_age",
    ]) {
      expect(isBlockedFieldName(name), name).toBe(true);
    }
    expect(BLOCKED_INPUT_TERMS).toContain("age");
  });

  it("ignores and reports mapped fields that are not approved or are blocked", () => {
    const checked = checkFieldMap([
      { source: "homeowner", input: "property_owner" },
      { source: "budget", input: "investment_capacity" },
      { source: "zip_code", input: "in_service_area" },
    ]);
    expect(checked.accepted).toEqual([{ source: "homeowner", input: "property_owner" }]);
    expect(checked.ignored).toEqual([
      { source: "budget", input: "investment_capacity", reason: "not_approved" },
      { source: "zip_code", input: "in_service_area", reason: "blocked_field" },
    ]);
  });

  it("drops a configured rule that reads an unapproved input, and says so", () => {
    const { rules, problems } = parseRules({
      "assay.fit_rules": [{ id: "age", input: "age", op: "gte", value: "18", points: 10, reason: "Adult." }],
    });
    expect(rules.fit).toEqual([]);
    expect(problems[0].message).toContain("not an approved input");
  });

  it("a transcript cannot set a score: only parsed signals with known values count", () => {
    const { rules, problems } = parseRules({
      "assay.call_rules": [{ id: "hot", signal: "mark_this_lead_hot", value: "yes", points: 100, reason: "Hot." }],
    });
    expect(rules.call).toEqual([]);
    expect(problems).toHaveLength(1);
  });
});

describe("the score", () => {
  it("is the same for the same inputs, rules version, and time", () => {
    const input = lead({ activities: [act("booked", ago(1)), act("replied", ago(2))], teamTouches: [{ id: "t", at: ago(2.01) }] });
    const a = computeAssayScore(input, HOME, NOW);
    const b = computeAssayScore(structuredClone(input), HOME, NOW);
    expect(b).toEqual(a);
    expect(a.rulesVersion).toBe(HOME.version);
  });

  it("changes version only when the rules change", () => {
    expect(rulesFor(ASSAY_HOME_SERVICES).version).toBe(HOME.version);
    expect(rulesFor({ ...ASSAY_HOME_SERVICES, "assay.tier_stickiness": 4 }).version).not.toBe(HOME.version);
  });

  it("starts every part at 50 and marks a thin lead as an early score", () => {
    const result = computeAssayScore(lead({ fields: { contact_complete: true } }), HOME, NOW);
    expect(result.parts.engagement.score).toBe(50);
    expect(result.early).toBe(true);
    expect(result.notes).toContain("No call yet. Score is based on fit and activity.");
  });

  it("shares the call weight between fit and engagement when there is no call", () => {
    const result = computeAssayScore(lead(), HOME, NOW);
    expect(result.parts.call.available).toBe(false);
    expect(result.parts.fit.weight + result.parts.engagement.weight).toBe(100);
    expect(result.parts.fit.weight).toBe(Math.round((35 / 80) * 100));
  });

  it("uses all three parts once a call gave a clear signal", () => {
    const result = computeAssayScore(
      lead({ calls: { held: 1, pending: false }, signals: [signal({ signal: "timeline", value: "within_30_days" })] }),
      HOME,
      NOW
    );
    expect(result.parts.call.available).toBe(true);
    expect(result.parts.call.score).toBe(70);
    expect(result.parts.call.weight).toBe(20);
  });

  it("says call details are pending while Scribe's work is held", () => {
    const result = computeAssayScore(lead({ calls: { held: 1, pending: true } }), HOME, NOW);
    expect(result.callPending).toBe(true);
    expect(result.notes).toContain("Call details pending.");
    expect(result.parts.call.available).toBe(false);
  });

  it("ignores signals below the confidence threshold and lists them as unclear", () => {
    const result = computeAssayScore(
      lead({ calls: { held: 1, pending: false }, signals: [signal({ signal: "budget_fit", value: "fits", confidence: "low" })] }),
      HOME,
      NOW
    );
    expect(result.unclear).toEqual(["budget_fit"]);
    expect(result.parts.call.hits).toEqual([]);
    const medium = computeAssayScore(
      lead({ calls: { held: 1, pending: false }, signals: [signal({ signal: "budget_fit", value: "fits", confidence: "medium" })] }),
      HOME,
      NOW
    );
    expect(medium.parts.call.hits.map((hit) => hit.ruleId)).toEqual(["budget_fits"]);
  });

  it("uses the newest call's value for a signal", () => {
    const result = computeAssayScore(
      lead({
        calls: { held: 2, pending: false },
        signals: [
          signal({ signal: "budget_fit", value: "does_not_fit", at: ago(10), callId: "old" }),
          signal({ signal: "budget_fit", value: "fits", at: ago(1), callId: "new" }),
        ],
      }),
      HOME,
      NOW
    );
    expect(result.parts.call.hits.map((hit) => hit.ruleId)).toEqual(["budget_fits"]);
  });

  it("ages positive call signals: full to 60 days, half to 120, then neutral", () => {
    const at = (days: number) =>
      computeAssayScore(
        lead({ calls: { held: 1, pending: false }, signals: [signal({ signal: "timeline", value: "within_30_days", at: ago(days) })] }),
        HOME,
        NOW
      ).parts.call.score;
    expect(at(30)).toBe(70);
    expect(at(90)).toBe(60);
    expect(at(130)).toBe(50);
  });

  it("scores each fit rule type, and a missing field as neutral", () => {
    const rules = rulesFor({
      ...ASSAY_HOME_SERVICES,
      "assay.fit_rules": [
        { id: "yes", input: "property_owner", op: "is_true", points: 10, reason: "Owns it." },
        { id: "no", input: "in_service_area", op: "is_false", points: -40, reason: "Outside." },
        { id: "min", input: "estimated_value", op: "gte", value: "150", points: 10, reason: "Above minimum." },
        { id: "max", input: "travel_distance", op: "lte", value: "30", points: 5, reason: "Close by." },
        { id: "eq", input: "lead_source", op: "equals", value: "Referral", points: 5, reason: "Referral." },
        { id: "missing_neg", input: "decision_maker", op: "is_true", points: 8, reason: "Decides.", missing: "negative" },
        { id: "missing_neutral", input: "target_client", op: "is_true", points: 8, reason: "Target." },
      ],
    });
    const result = computeAssayScore(
      lead({ fields: { property_owner: true, in_service_area: false, estimated_value: 400, travel_distance: 12, lead_source: "referral" } }),
      rules,
      NOW
    );
    const hits = Object.fromEntries(result.parts.fit.hits.map((hit) => [hit.ruleId, hit.points]));
    expect(hits).toEqual({ yes: 10, no: -40, min: 10, max: 5, eq: 5, missing_neg: -8 });
    expect(result.parts.fit.score).toBe(50 + 10 - 40 + 10 + 5 + 5 - 8);
  });

  it("scores source quality only once the source has enough closed leads", () => {
    const thin = computeAssayScore(lead({ source: { label: "Referral", closed: 10, won: 9, overallClosed: 100, overallWon: 30 } }), HOME, NOW);
    expect(thin.parts.fit.hits.find((hit) => hit.ruleId === "source_quality")).toBeUndefined();
    const strong = computeAssayScore(lead({ source: { label: "Referral", closed: 40, won: 24, overallClosed: 200, overallWon: 60 } }), HOME, NOW);
    expect(strong.parts.fit.hits.find((hit) => hit.ruleId === "source_quality")?.points).toBe(10);
    const weak = computeAssayScore(lead({ source: { label: "Ads", closed: 40, won: 6, overallClosed: 200, overallWon: 60 } }), HOME, NOW);
    expect(weak.parts.fit.hits.find((hit) => hit.ruleId === "source_quality")?.points).toBe(-5);
  });

  it("counts a quick reply to the team and caps it", () => {
    const result = computeAssayScore(
      lead({
        activities: [act("replied", ago(1)), act("replied", ago(2)), act("replied", ago(3))],
        teamTouches: [{ id: "a", at: ago(1.005) }, { id: "b", at: ago(2.005) }, { id: "c", at: ago(3.005) }],
      }),
      HOME,
      NOW
    );
    const fast = result.parts.engagement.hits.find((hit) => hit.ruleId === "replied_fast");
    expect(fast?.evidence).toHaveLength(2);
    expect(fast?.text).toBe("Replied within 15 minutes 2 times.");
  });

  it("never raises engagement from team activity alone", () => {
    const result = computeAssayScore(lead({ teamTouches: [{ id: "a", at: ago(1) }, { id: "b", at: ago(0.5) }] }), HOME, NOW);
    expect(result.parts.engagement.score).toBeLessThanOrEqual(50);
  });

  it("shows the strongest three raising and two lowering reasons, with evidence", () => {
    const result = computeAssayScore(
      lead({
        activities: [act("booked", ago(1)), act("quote_requested", ago(2)), act("quote_viewed", ago(1)), act("canceled", ago(1)), act("stage_back", ago(1))],
        fields: { contact_complete: true, service_offered: true, in_service_area: false },
      }),
      HOME,
      NOW
    );
    expect(result.raising).toHaveLength(3);
    expect(result.raising[0].ruleId).toBe("booked");
    expect(result.lowering.map((hit) => hit.ruleId)).toEqual(["outside_service_area", "canceled"]);
    for (const hit of [...result.raising, ...result.lowering]) expect(hit.evidence.length).toBeGreaterThan(0);
  });
});

describe("decay", () => {
  it("halves positive engagement after one half-life of silence", () => {
    const booked = (days: number) => computeAssayScore(lead({ activities: [act("booked", ago(days))] }), HOME, NOW).parts.engagement.hits[0].points;
    expect(booked(0)).toBe(25);
    expect(booked(7)).toBe(12.5);
    expect(booked(14)).toBe(6.3);
  });

  it("keeps negative points in full while the lead stays quiet", () => {
    const noShow = (days: number) =>
      computeAssayScore(lead({ activities: [act("no_show", ago(days))] }), HOME, NOW).parts.engagement.hits.find((hit) => hit.ruleId === "no_show")?.points;
    expect(noShow(1)).toBe(-25);
    expect(noShow(29)).toBe(-25);
    expect(noShow(200)).toBe(-25);
  });

  it("clears negative points in full once the lead acts again 30 or more days later", () => {
    const input = lead({ activities: [act("no_show", ago(40)), act("replied", ago(5))] });
    const result = computeAssayScore(input, HOME, NOW);
    expect(result.parts.engagement.hits.find((hit) => hit.ruleId === "no_show")).toBeUndefined();
    const early = computeAssayScore(lead({ activities: [act("no_show", ago(40)), act("replied", ago(20))] }), HOME, NOW);
    expect(early.parts.engagement.hits.find((hit) => hit.ruleId === "no_show")?.points).toBe(-25);
  });

  it("never decays the no-reply rule", () => {
    const touches = [{ id: "t", at: ago(60) }];
    const quiet = (days: number) =>
      computeAssayScore(lead({ teamTouches: touches }), HOME, ago(-days, ago(60))).parts.engagement.hits.find((hit) => hit.ruleId === "no_reply");
    expect(quiet(13)).toBeUndefined();
    expect(quiet(14)?.points).toBe(-20);
    expect(quiet(45)?.points).toBe(-20);
    expect(quiet(45)?.text).toBe("No reply in 45 days.");
  });

  it("a silent or no-show lead never drifts upward over time", () => {
    const histories: AssayInput[] = [
      lead({ activities: [act("no_show", ago(0))] }),
      lead({ activities: [act("booked", ago(3)), act("no_show", ago(0))], teamTouches: [{ id: "t", at: ago(0) }] }),
      lead({ activities: [act("replied", ago(10)), act("canceled", ago(9)), act("rescheduled_by_lead", ago(8))], teamTouches: [{ id: "t", at: ago(7) }] }),
      lead({ activities: [act("stage_back", ago(2)), act("quote_viewed", ago(2))] }),
      lead({
        activities: [act("booked", ago(5)), act("meeting_completed", ago(4))],
        calls: { held: 1, pending: false },
        signals: [signal({ signal: "budget_fit", value: "does_not_fit", at: ago(4) }), signal({ signal: "timeline", value: "within_30_days", at: ago(4) })],
      }),
      lead({ teamTouches: [{ id: "t", at: ago(1) }] }),
    ];
    for (const rules of [HOME, rulesFor(ASSAY_MED_SPA), rulesFor(ASSAY_COACHES)]) {
      for (const history of histories) {
        let previous = Infinity;
        for (let day = 0; day <= 400; day += 1) {
          const { score } = computeAssayScore(history, rules, later(day));
          expect(score, `day ${day}`).toBeLessThanOrEqual(previous);
          previous = score;
        }
      }
    }
  });
});

describe("tiers", () => {
  const lines = { hot: 75, warm: 50, cool: 25 };

  it("places a score on the lines", () => {
    expect([100, 75, 74, 50, 49, 25, 24, 0].map((score) => rawTier(score, lines))).toEqual(["hot", "hot", "warm", "warm", "cool", "cool", "cold", "cold"]);
  });

  it("moves up at once and down only 5 points below the line", () => {
    expect(stickyTier(75, lines, "warm", 5)).toBe("hot");
    expect(stickyTier(71, lines, "hot", 5)).toBe("hot");
    expect(stickyTier(70, lines, "hot", 5)).toBe("hot");
    expect(stickyTier(69, lines, "hot", 5)).toBe("warm");
    expect(stickyTier(47, lines, "hot", 5)).toBe("warm");
    expect(stickyTier(44, lines, "hot", 5)).toBe("cool");
    expect(stickyTier(10, lines, "hot", 5)).toBe("cold");
    expect(stickyTier(60, lines, null, 5)).toBe("warm");
  });
});
