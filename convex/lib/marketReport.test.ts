import { describe, expect, it } from "vitest";

import { keepSupported } from "../skills/marketIntelligence";
import { stepAllowance } from "./estimate";
import { NO_CONTEXT, TWO_OPPORTUNITIES, checkReport, readOpportunities, type Brief, type CheckInputs, type MarketReport, type Opportunity } from "./marketReport";

const brief: Brief = {
  objective: "Win more bookings",
  deliverables: ["x"],
  market: "Cleaning",
  geography: "Austin",
  platforms: ["web"],
  known: {
    profileVersionId: "p1",
    profileVersion: 1,
    factIds: [],
    verifiedFactIds: [],
    items: [{ key: "profile.offer", label: "offer", value: "Deep cleaning", origin: "profile", status: "confirmed", recordedAt: 1 }],
  },
  missing: [],
  assumptions: [],
};

function opp(action: string, refs = ["s1"]): Opportunity {
  return {
    opportunity: `Do ${action}`,
    evidence: { basis: refs.length ? "observed" : "hypothesis", sourceRefIds: refs },
    businessRelevance: { text: "Fits the offer.", contextUsed: ["profile.offer"] },
    proposedAction: action,
    validationMethod: "Count bookings.",
  };
}

function report(overrides: Partial<MarketReport> = {}): MarketReport {
  return {
    objective: brief.objective,
    brief,
    contextUsed: ["profileVersion:p1"],
    summary: "s",
    observations: [],
    opportunities: [opp("a"), opp("b"), opp("c")],
    missingOpportunityReason: null,
    limits: [],
    ...overrides,
  };
}

const inputs: CheckInputs = { brief, droppedClaims: [], notAvailable: [], runCostCents: 10, runCapCents: 300 };

function failed(r: MarketReport, extra: Partial<CheckInputs> = {}) {
  return checkReport(r, { ...inputs, ...extra })
    .filter((row) => !row.passed)
    .map((row) => row.key);
}

describe("market report completion check", () => {
  it("passes a complete report on all eight checks", () => {
    const results = checkReport(report(), inputs);
    expect(results.map((row) => row.key)).toEqual([
      "objectiveAndContext",
      "contextListed",
      "threeOpportunities",
      "claimsSourced",
      "claimsHaveBasis",
      "limitsNamed",
      "structure",
      "withinCap",
    ]);
    expect(results.every((row) => row.passed)).toBe(true);
  });

  it("fails each check on its own fault", () => {
    expect(failed(report({ objective: "Something else" }))).toEqual(["objectiveAndContext"]);
    expect(failed(report({ opportunities: [opp("a"), opp("b"), { ...opp("c"), businessRelevance: { text: "t", contextUsed: [] } }] }))).toEqual([
      "objectiveAndContext",
    ]);
    expect(failed(report({ contextUsed: [] }))).toEqual(["contextListed"]);
    expect(failed(report({ opportunities: [opp("a"), opp("b"), opp("A!")] }))).toEqual(["threeOpportunities"]);
    expect(failed(report(), { droppedClaims: ["opportunity:0"] })).toEqual(["claimsSourced"]);
    expect(failed(report(), { notAvailable: [{ platform: "youtube", state: "unavailable" }] })).toEqual(["limitsNamed"]);
    expect(failed(report({ opportunities: [opp("a"), opp("b"), { ...opp("c"), validationMethod: "" }] }))).toEqual(["structure"]);
    expect(failed(report(), { runCostCents: 301 })).toEqual(["withinCap"]);
  });

  it("fails two opportunities with the plain reason, and needs the missing one explained", () => {
    const two = report({ opportunities: [opp("a"), opp("b")], missingOpportunityReason: "Only two." });
    const results = checkReport(two, inputs);
    expect(results.find((row) => row.key === "threeOpportunities")).toEqual({ key: "threeOpportunities", passed: false, detail: TWO_OPPORTUNITIES });
    expect(failed(two)).toEqual(["threeOpportunities"]);
    expect(failed({ ...two, missingOpportunityReason: null })).toEqual(["threeOpportunities", "structure"]);
  });

  it("asks for the no-context words when the workspace has no profile and no facts", () => {
    const empty = { ...brief, known: { ...brief.known, profileVersionId: null, items: [] } };
    const bare = (text: string) => ({ ...opp("x"), businessRelevance: { text, contextUsed: [] } });
    const ok = report({ brief: empty, contextUsed: [], opportunities: [bare(`${NO_CONTEXT}.`), { ...bare(`${NO_CONTEXT}.`), proposedAction: "y" }, { ...bare(`${NO_CONTEXT}.`), proposedAction: "z" }] });
    expect(failed(ok, { brief: empty })).toEqual([]);
    expect(failed({ ...ok, opportunities: [bare("Fits."), ...ok.opportunities.slice(1)] }, { brief: empty })).toEqual(["objectiveAndContext"]);
  });
});

describe("reading opportunities", () => {
  it("drops unknown sources and context keys, and labels an unsupported opportunity a hypothesis", () => {
    const read = readOpportunities(
      { opportunities: [{ opportunity: "o", basis: "observed", sourceRefIds: ["made-up"], businessRelevance: "r", contextUsed: ["fact:other"], proposedAction: "a", validationMethod: "v" }] },
      new Set(["s1"]),
      new Set(["profile.offer"]),
    );
    expect(read.opportunities[0].evidence).toEqual({ basis: "hypothesis", sourceRefIds: [] });
    expect(read.opportunities[0].businessRelevance.contextUsed).toEqual([]);
    expect(read.missingOpportunityReason).toBeTruthy();
  });

  it("never keeps more than three", () => {
    const row = { opportunity: "o", basis: "observed", sourceRefIds: ["s1"], businessRelevance: "r", contextUsed: [], proposedAction: "a", validationMethod: "v" };
    expect(readOpportunities({ opportunities: [row, row, row, row] }, new Set(["s1"]), new Set()).opportunities).toHaveLength(3);
  });

  it("does not let a revision add an untested opportunity to reach three", () => {
    const before = [opp("a"), opp("b")];
    const revised = { opportunities: [opp("a"), opp("b"), opp("c", [])], missingOpportunityReason: null };
    const kept = keepSupported(before, revised);
    expect(kept.opportunities.map((row) => row.proposedAction)).toEqual(["a", "b"]);
    expect(kept.missingOpportunityReason).toBe(TWO_OPPORTUNITIES);
    // A supported third, from sources already collected, may stand.
    expect(keepSupported(before, { opportunities: [opp("a"), opp("b"), opp("c")], missingOpportunityReason: null }).opportunities).toHaveLength(3);
  });
});

describe("step allowance", () => {
  it("keeps the reserve from ordinary steps and gives it to the revision", () => {
    const base = { runCapCents: 300, dayCapCents: 2500, runCostCents: 200, dayCostCents: 200, reserveCents: 50 };
    expect(stepAllowance({ ...base, useReserve: false })).toBe(50);
    expect(stepAllowance({ ...base, useReserve: true })).toBe(100);
    expect(stepAllowance({ ...base, dayCostCents: 2480, useReserve: true })).toBe(20);
  });
});
