import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SKILL_CAPS } from "../../../convex/lib/caps";
import { DEFAULT_MARKUP, creditWords, creditsForCost } from "../../../convex/lib/credits";
import { RESULT_WORDS } from "@/components/research/outcome-loop";
import { AGENTS_SECTION, EVIDENCE, GROWTH_ARCHITECT } from "@/lib/marketing/content";
import * as visuals from "@/lib/marketing/app-visuals";

const { AD_SET, APP_VISUALS, BRIEFING, OFFER_COMPARE, PAGE_TEARDOWN, RESULTS, TASKS, TEST_PLAN, TOUR } = visuals;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const WORDS = strings(visuals).join("\n");
const available = GROWTH_ARCHITECT.skills.filter((skill) => skill.status === "available").map((skill) => skill.name as string);
const cap = (skill: keyof typeof SKILL_CAPS) => creditWords(creditsForCost(SKILL_CAPS[skill].maxCostCentsPerRun, DEFAULT_MARKUP));

describe("the app, drawn on the public page", () => {
  it("is drawn, not photographed: no screenshots of the app are left", () => {
    expect(existsSync(join(process.cwd(), "public/marketing/product"))).toBe(false);
    expect(existsSync(join(process.cwd(), "scripts/capture-landing-pictures.cjs"))).toBe(false);
    expect(APP_VISUALS.note).toMatch(/simplified view of the app, with sample data/);
  });

  it("keeps the window's four tabs", () => {
    expect(TOUR.map((screen) => screen.tab)).toEqual(["Tasks", "Briefing", "Home", "Clients"]);
    for (const screen of TOUR) expect(screen.doing.length, screen.id).toBeGreaterThan(10);
  });

  it("names the live agent and only skills that run", () => {
    const agents = AGENTS_SECTION.departments.flatMap((group) => [...group.agents]);
    expect(agents.find((agent) => agent.name === APP_VISUALS.agent)?.live).toBe(true);
    for (const skill of [OFFER_COMPARE.skill, AD_SET.skill, PAGE_TEARDOWN.skill]) expect(available).toContain(skill);
    for (const card of TASKS.cards) {
      const [kind, skill] = card.kind.split(" · ");
      if (kind === "Agent work") expect(available, card.id).toContain(skill);
      else expect(card.kind, card.id).toBe("A change you make");
    }
    // No agent that does not run yet appears as doing work.
    const planned = agents.filter((agent) => !agent.live).map((agent) => agent.name);
    for (const name of planned) expect(WORDS, name).not.toMatch(new RegExp(`\\b${name}\\b`));
  });

  it("shows every task with what the app shows: an expected return or an honest gap, a credit cost and evidence", () => {
    const labels = new Set<string>(EVIDENCE.kinds.map((kind) => kind.id));
    for (const card of TASKS.cards) {
      expect(labels.has(card.basis), card.id).toBe(true);
      // A figure, or "Not enough data" and no figure. Never a figure the app could not stand behind.
      expect(Boolean(card.expected), card.id).toBe((card.basis as string) !== "insufficient");
      expect(card.cost, card.id).toMatch(/^(No credits|Up to [\d,]+ credits)$/);
      expect(card.evidence, card.id).toMatch(/^Evidence: \d+ items?$/);
    }
    expect(TASKS.columns.map((column) => column.name)).toEqual(["Proposed", "Approved", "Running"]);
  });

  it("states credit limits that are the real ones, in credits and never in dollars", () => {
    const cost = (id: string) => TASKS.cards.find((card) => card.id === id)?.cost;
    expect(cost("cfo-pricing")).toBe(`Up to ${cap("market-intelligence")}`);
    expect(cost("own-enquiries")).toBe(`Up to ${cap("growth-diagnostics")}`);
    expect(BRIEFING.posts.find((post) => post.id === "cfo-pricing")?.cost).toBe(`Up to ${cap("market-intelligence")}`);
    // A dollar sign may only be a sample customer's own price or figure, never what Vistrial's work costs.
    for (const line of strings({ TASKS, BRIEFING, APP_VISUALS, TOUR })) expect(line).not.toMatch(/\$|¢/);
  });

  it("uses the app's own words for a result and for how sure a claim is", () => {
    const results = new Set(Object.values(RESULT_WORDS).map((word) => word.label));
    for (const card of RESULTS.cards) expect(results.has(card.result), card.title).toBe(true);
    // One result that helped and one that did not: the page does not show only wins.
    expect(RESULTS.cards.map((card) => card.tone)).toEqual(["good", "neutral"]);
    const labels = new Set<string>(EVIDENCE.kinds.map((kind) => kind.id));
    for (const change of TEST_PLAN.changes) expect(labels.has(change.basis), change.title).toBe(true);
    for (const card of RESULTS.cards) expect(labels.has(card.basis), card.title).toBe(true);
    expect(AD_SET.hypothesisLabel).toBe("Untested hypothesis:");
  });

  it("compares offers cell for cell, and marks only what a competitor states and you do not", () => {
    for (const row of OFFER_COMPARE.rows) expect(row.cells).toHaveLength(OFFER_COMPARE.columns.length);
    const flagged = OFFER_COMPARE.rows.filter((row) => "flagged" in row && row.flagged);
    expect(flagged.map((row) => row.label)).toEqual(["Guarantee"]);
    for (const row of flagged) {
      expect(row.cells[0]).toBeNull();
      expect(row.cells.slice(1).some(Boolean)).toBe(true);
    }
  });

  it("counts the teardown's sections the way its list shows them", () => {
    const states = PAGE_TEARDOWN.sections.map((section) => section.state);
    expect(states.filter((state) => state === "skipped")).toHaveLength(PAGE_TEARDOWN.weak.length);
    expect(AD_SET.variations.map((variation) => variation.letter)).toEqual(["A", "B", "C", "D"]);
  });

  it("uses customers the product is for, promises nothing, and has no em dash", () => {
    // The sample is an agency and the coaches and consultants it works for.
    expect(WORDS).not.toMatch(/\b(dental|dentist|med ?spa|plumb\w*|roof\w*|hvac|home-service|cleaning)\b/i);
    expect(WORDS).not.toMatch(/—/);
    expect(WORDS).not.toMatch(/guaranteed results|we guarantee|\d+x (more|return)/i);
    expect(WORDS).not.toMatch(/Growth Architect/);
  });
});
