import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../convex/catalog";
import { BASIS_LABEL } from "../../../convex/lib/evidence";
import { PLAN } from "../../../convex/lib/billing";
import { SKILL_CAPS, SOFT_WARNING_RATIO } from "../../../convex/lib/caps";
import { CHECK_IN_DAYS } from "../../../convex/decisions";
import { RESULT_WORDS } from "@/components/research/outcome-loop";
import { STAGES } from "@/lib/research/words";
import { BUSINESS_TYPES } from "@/lib/access-requests/options";
import * as content from "@/lib/marketing/content";
import { PRICING_DISPLAY } from "@/lib/marketing/pricing";
import { JOURNEY_TABS, journeyTabOf } from "@/lib/shell/journey";

const { AGENTS_SECTION, CLAIMS, DOCTRINE_RUN, EVIDENCE, GROWTH_ARCHITECT, HOW, LOOP_DEMO, SAFETY, SOURCES } = content;

/** Every string on the public page, wherever it sits in the copy objects. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const PUBLIC_COPY = [...strings(content), ...strings(PRICING_DISPLAY), ...BUSINESS_TYPES.map((row) => row.label)];

describe("the public page tells the truth about the product", () => {
  const architect = CATALOG.find((agent) => agent.slug === "growth-architect")!;

  it("marks a skill available only when the catalog does", () => {
    const catalog = Object.fromEntries(architect.skills.map((skill) => [skill.slug, skill.status]));
    expect(GROWTH_ARCHITECT.skills.map((skill) => skill.id).sort()).toEqual(Object.keys(catalog).sort());
    for (const skill of GROWTH_ARCHITECT.skills) expect(skill.status, skill.id).toBe(catalog[skill.id]);
  });

  it("uses the catalog's skill and agent names, and marks an agent live only when it is", () => {
    const names = Object.fromEntries(architect.skills.map((skill) => [skill.slug, skill.name]));
    for (const skill of GROWTH_ARCHITECT.skills) expect(skill.name).toBe(names[skill.id]);
    const shown = AGENTS_SECTION.departments.flatMap((group) => group.agents.map((agent) => ({ ...agent, group: group.id })));
    expect(shown.map((agent) => agent.name).sort()).toEqual(CATALOG.map((agent) => agent.name).sort());
    for (const agent of shown) {
      const row = CATALOG.find((entry) => entry.name === agent.name)!;
      expect(agent.live, agent.name).toBe(row.status === "live");
      expect(agent.group, agent.name).toBe(journeyTabOf(row.lifecycle) ?? "run");
    }
  });

  it("groups agents the way the app does", () => {
    expect(AGENTS_SECTION.departments.slice(0, 3).map((group) => group.name)).toEqual(JOURNEY_TABS.map((tab) => tab.label));
  });

  it("uses the product's evidence labels", () => {
    for (const kind of EVIDENCE.kinds) expect(kind.label).toBe(BASIS_LABEL[kind.id]);
  });

  it("states the plan's real price and credits", () => {
    const price = `$${PLAN.priceCents / 100}`;
    const credits = `$${PLAN.includedCents / 100}`;
    expect(PRICING_DISPLAY.privateAccess.price).toContain(price);
    expect(PRICING_DISPLAY.privateAccess.price).toContain(credits);
    expect(PUBLIC_COPY.join("\n")).not.toMatch(/\$97\b|Starting at/);
  });

  it("does not list a research source that is not working", () => {
    expect(SOURCES.items.map((item) => item.label).join(" ")).not.toMatch(/Ad Library/);
  });

  it("backs every factual claim with a support line", () => {
    expect(CLAIMS.length).toBeGreaterThan(8);
    for (const claim of CLAIMS) {
      expect(claim.statement.length).toBeGreaterThan(10);
      expect(claim.support.length, claim.statement).toBeGreaterThan(20);
    }
  });

  it("is written for agencies, consultants, coaches and info sellers, not the earlier audience or product", () => {
    const copy = PUBLIC_COPY.join("\n");
    expect(copy).not.toMatch(/med(ical)? spa|aesthetic|home services|remodel|cleaning|considered purchase/i);
    expect(copy).not.toMatch(/\b(Sentry|Scribe|Relay|Compass)\b|quiet hours|case file|GoHighLevel/);
    expect(copy).not.toMatch(/—/);
    expect(BUSINESS_TYPES.map((row) => row.value)).toEqual(["agency", "consulting", "coaching", "info-products", "other"]);
  });

  it("keeps the main button a request for access, with no checkout", () => {
    expect(content.HERO.primaryCta).toBe("Request private access");
    expect(content.NAV.request).toBe("Request private access");
    expect(content.FINAL_CTA.primary).toBe("Request private access");
    expect(PRICING_DISPLAY.privateAccess.cta).toBe("Request private access");
    expect(PRICING_DISPLAY.connectedToBilling).toBe(false);
    expect(content.SECTIONS.proof).toBe(false);
  });

  it("shows the safety run with the product's own limit, and every guardrail in it", () => {
    const { run } = SAFETY;
    expect(run.budget.capCents).toBe(SKILL_CAPS["market-intelligence"].maxCostCentsPerRun);
    expect(run.budget.warnShare).toBe(SOFT_WARNING_RATIO);
    const spent = run.steps.map((step) => step.spentCents);
    expect([...spent].sort((a, b) => a - b)).toEqual(spent);
    expect(Math.max(...spent)).toBeLessThan(run.budget.capCents);
    // A refused page costs nothing, and the run ends waiting for a person.
    const refused = run.steps.findIndex((step) => step.state === "blocked");
    expect(run.steps[refused].spentCents).toBe(run.steps[refused - 1].spentCents);
    expect(run.steps.at(-1)?.state).toBe("waiting");
    // One guardrail per safety statement, and each step points at a guardrail that exists.
    expect(run.guards).toHaveLength(SAFETY.items.length);
    const guards = new Set<string>(run.guards.map((guard) => guard.id));
    for (const step of run.steps) expect(guards.has(step.guard), step.id).toBe(true);
    expect(run.recordApproved.text).toMatch(/Not published/);
  });

  it("shows a plan only for a skill that runs, and every plan ends waiting for a person", () => {
    for (const skill of GROWTH_ARCHITECT.skills) {
      if (skill.status === "available") {
        expect(skill.plan.length, skill.id).toBeGreaterThanOrEqual(4);
        expect(skill.plan.at(-1), skill.id).toMatch(/wait for you/i);
      } else {
        expect(skill.plan, skill.id).toEqual([]);
      }
    }
  });

  it("replays the run in the product's own five stages", () => {
    expect(HOW.steps.map((step) => step.id)).toEqual(STAGES.map((stage) => stage.id));
    expect(HOW.steps.map((step) => step.title)).toEqual(STAGES.map((stage) => stage.label));
    for (const step of HOW.steps) expect(DOCTRINE_RUN.replay.did[step.id].length, step.id).toBeGreaterThan(1);
  });

  it("shows the loop in the product's own words and check-in choices", () => {
    expect([...LOOP_DEMO.answers]).toEqual(Object.values(RESULT_WORDS).map((row) => row.label));
    expect(LOOP_DEMO.answers).toContain(LOOP_DEMO.chosen);
    expect((CHECK_IN_DAYS as readonly number[]).map((days) => `${days} days`)).toContain(LOOP_DEMO.days);
    expect(LOOP_DEMO.tryButton).toBe("We'll try this");
  });
});
