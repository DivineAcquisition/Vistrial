import { creditCount } from "../../../convex/lib/credits";
import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../convex/catalog";
import { BASIS_LABEL } from "../../../convex/lib/evidence";
import { PLAN } from "../../../convex/lib/billing";
import { BUSINESS_TYPES } from "@/lib/access-requests/options";
import * as content from "@/lib/marketing/content";
import { PRICING_DISPLAY } from "@/lib/marketing/pricing";
import { JOURNEY_TABS, journeyTabOf } from "@/lib/shell/journey";

const { AGENTS_SECTION, CLAIMS, EVIDENCE, GROWTH_ARCHITECT, SOURCES } = content;

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
    const credits = `${creditCount(PLAN.includedCents)} credits`;
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
});
