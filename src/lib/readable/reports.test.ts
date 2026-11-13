import { describe, expect, it } from "vitest";

import { diagnosisGlance, nextRoadmapStep, offerGlance, stageLabel, stepLabel } from "./analysis";
import { headingId, reportGlance } from "./report";

const BODY = [
  "# Market report",
  "",
  "**Objective:** Find what Austin deep-cleaning competitors lead with.",
  "",
  "Competitors lead with trust or with before-and-after results,",
  "and none showed a price.",
  "",
  "## Opportunities",
  "",
  "### 1. Lead with visible flat-rate pricing",
  "",
  "- **Evidence:** Untested hypothesis",
  "- **Why it matters here:** Your offer is flat-rate.",
  "- **Proposed action:** List both prices on your profile.",
  "- **How to tell if it worked:** Compare four weeks of calls before and after.",
  "",
  "### 2. Show a named result",
  "",
  "- **Evidence:** 2 sources",
  "- **Proposed action:** Add one client result to the first screen.",
  "",
  "## Findings",
  "",
  "- Trust is the most repeated lead message. _(Observed)_",
  "- A flat price may set the business apart. _(Inference)_",
  "",
  "## Limits",
  "",
  "- **web:** Partial. Many pages were link-only.",
  "",
  "_Publicly visible ads and posts are not evidence that a campaign was profitable._",
].join("\n");

describe("a report at a glance", () => {
  const glance = reportGlance(BODY, [
    { basisLabel: "Observed", sources: [{ url: "https://a.example.com" }, { url: "https://b.example.com" }] },
    { basisLabel: "Inference", sources: [{ url: "https://a.example.com" }] },
    { basisLabel: "Untested hypothesis", sources: [] },
    { basisLabel: null, sources: [], missing: true },
  ]);
  it("takes the summary and objective from the report's own words", () => {
    expect(glance.summary).toBe("Competitors lead with trust or with before-and-after results, and none showed a price.");
    expect(glance.objective).toBe("Find what Austin deep-cleaning competitors lead with.");
  });
  it("reads each opportunity's fields", () => {
    expect(glance.opportunities).toEqual([
      { title: "Lead with visible flat-rate pricing", evidence: "Untested hypothesis", why: "Your offer is flat-rate.", action: "List both prices on your profile.", howToTell: "Compare four weeks of calls before and after." },
      { title: "Show a named result", evidence: "2 sources", why: "", action: "Add one client result to the first screen.", howToTell: "" },
    ]);
  });
  it("outlines the sections with a count of what is in each", () => {
    expect(glance.sections).toEqual([
      { title: "Opportunities", id: "report-opportunities", items: 2 },
      { title: "Findings", id: "report-findings", items: 2 },
      { title: "Limits", id: "report-limits", items: 1 },
    ]);
    expect(headingId("**Opportunities**")).toBe("report-opportunities");
  });
  it("counts claims, distinct sources and claims with no source", () => {
    expect([glance.claims, glance.sources, glance.missing]).toEqual([4, 2, 1]);
  });
  it("carries the weakest label of its claims", () => {
    expect(glance.weakest).toBe("Untested hypothesis");
    expect(glance.byLabel.map((row) => [row.label, row.count])).toEqual([["Untested hypothesis", 1], ["Inference", 1], ["Observed", 1]]);
  });
  it("a line that only says data is missing does not relabel the findings", () => {
    expect(reportGlance(BODY, [{ basisLabel: "Observed" }, { basisLabel: "Not enough data" }]).weakest).toBe("Observed");
    expect(reportGlance(BODY, [{ basisLabel: "Not enough data" }]).weakest).toBe("Not enough data");
  });
  it("finds nothing in text that is not a report, and invents nothing", () => {
    const none = reportGlance("Market snapshot\n42 ads from 9 advertisers.", []);
    expect(none).toMatchObject({ summary: "Market snapshot 42 ads from 9 advertisers.", opportunities: [], sections: [], weakest: null, claims: 0 });
  });
});

describe("an offer analysis at a glance", () => {
  const view = {
    competitors: [
      { competitor: "A", gaps: { price: false, guarantee: true } },
      { competitor: "B", gaps: { price: false, guarantee: true } },
      { competitor: "C", gaps: { price: false, guarantee: false } },
    ],
    gapsAndRisks: [
      { kind: "gap", basisLabel: "Observed" },
      { kind: "risk", basisLabel: "Inference" },
    ],
    changes: [
      { index: 0, basisLabel: "Observed" },
      { index: 1, basisLabel: "Your data" },
    ],
  };
  it("counts what the table flags", () => {
    expect(offerGlance(view)).toEqual({ competitors: 3, fieldsBehind: ["guarantee"], gaps: 1, risks: 1, changes: 2, weakest: "Inference" });
  });
  it("never reads a missing basis as strong", () => {
    expect(offerGlance({ ...view, changes: [{ index: 0, basisLabel: null }] }).weakest).toBe("Untested hypothesis");
  });
});

describe("a diagnosis at a glance", () => {
  const roadmap = [
    { index: 0, phase: "fix", figures: [1] },
    { index: 1, phase: "fix", figures: [1] },
    { index: 2, phase: "build", figures: [1] },
    { index: 3, phase: "scale", figures: [] },
  ];
  it("labels the stage by whether figures stand behind it", () => {
    expect(stageLabel({ hasData: true, stage: "leads", stageFigures: [1] })).toBe("Your data");
    expect(stageLabel({ hasData: true, stage: "unknown", stageFigures: [] })).toBe("Not enough data");
    expect(stageLabel({ hasData: false, stage: "leads", stageFigures: [1] })).toBe("Not enough data");
  });
  it("labels a step by whether it cites figures", () => {
    expect(stepLabel(roadmap[0])).toBe("Inference");
    expect(stepLabel(roadmap[3])).toBe("Not enough data");
  });
  it("names the first step nobody is trying yet, Fix before Build before Scale", () => {
    expect(nextRoadmapStep(roadmap, (index) => index === 0)?.index).toBe(1);
    expect(nextRoadmapStep([roadmap[2], roadmap[1]], () => false)?.index).toBe(1);
    expect(nextRoadmapStep(roadmap, () => true)).toBeNull();
  });
  it("counts steps, steps under way and steps with no figures", () => {
    expect(diagnosisGlance({ hasData: true, stage: "leads", stageFigures: [1], roadmap, missing: ["x"] }, (index) => index === 0)).toMatchObject({ label: "Your data", steps: 4, underWay: 1, thin: 1, missing: 1 });
  });
});
