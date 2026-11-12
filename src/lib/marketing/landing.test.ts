import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PLAN, TOPUP_PACKS_CENTS } from "../../../convex/lib/billing";
import { CHECK_IN_DAYS } from "../../../convex/decisions";
import { AGENTS_SECTION, FINAL_CTA, GROWTH_ARCHITECT, HERO, NAV, SECTIONS } from "@/lib/marketing/content";
import * as landing from "@/lib/marketing/landing";

const { COMPARE, CTA, FIXES, LANDING_FAQ, LANDING_HERO, LANDING_ORDER, LOOP, OFFER, PAINS, PICTURES, PROCESS, ROLES, landingProblems } = landing;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const COPY = strings(landing).join("\n");

describe("the landing page follows the owner's framework", () => {
  it("may be published: no required section is empty and pains match fixes", () => {
    expect(landingProblems()).toEqual([]);
  });

  it("refuses a page whose pain and solution counts differ", () => {
    const fixes = FIXES.items as unknown as unknown[];
    const removed = fixes.pop();
    try {
      expect(landingProblems().join(" ")).toMatch(/Pain and solution counts differ/);
    } finally {
      fixes.push(removed);
    }
    expect(landingProblems()).toEqual([]);
  });

  it("refuses a page with an empty required section", () => {
    const steps = PROCESS.steps as unknown as unknown[];
    const kept = steps.splice(0, steps.length);
    try {
      expect(landingProblems().join(" ")).toMatch(/Process/);
    } finally {
      steps.push(...kept);
    }
    expect(landingProblems()).toEqual([]);
  });

  it("keeps the framework's order, with results off until there is real proof", () => {
    expect(LANDING_ORDER).toEqual(["nav", "hero", "results", "problem", "solution", "offer", "compare", "process", "roles", "faq", "final"]);
    expect(SECTIONS.proof).toBe(false);
  });

  it("has one button with a verb, the same words everywhere, and no menu links", () => {
    expect(CTA.label).toBe("Request private access");
    expect([NAV.request, HERO.primaryCta, FINAL_CTA.primary]).toEqual([CTA.label, CTA.label, CTA.label]);
    expect(NAV.links).toEqual([]);
    expect(COPY).not.toMatch(/Start for \$|Buy now|Checkout|Start free/i);
  });

  it("opens with the hero copy the owner chose: who it is for, what it does, and one button", () => {
    expect(LANDING_HERO.headline).toBe("The agentic workforce for business growth.");
    expect(LANDING_HERO.supporting).toMatch(/agencies, consultants, coaches and info sellers/);
    expect(LANDING_HERO.trust).toMatch(/Nothing is published without a person's approval/);
    expect(HERO.headline).toBe(LANDING_HERO.headline);
  });

  it("pairs three to six pains with fixes one for one, each pain with a cost that is not an invented figure", () => {
    expect(PAINS.items.length).toBeGreaterThanOrEqual(3);
    expect(PAINS.items.length).toBeLessThanOrEqual(6);
    expect(FIXES.items.map((fix) => fix.id)).toEqual(PAINS.items.map((pain) => pain.id));
    for (const pain of PAINS.items) expect(pain.cost, pain.id).not.toMatch(/[$%]|\d/);
  });

  it("matches with and without row for row", () => {
    for (const row of COMPARE.rows) {
      expect(row.with.length).toBeGreaterThan(0);
      expect(row.without.length).toBeGreaterThan(0);
    }
    expect(new Set(COMPARE.rows.map((row) => row.topic)).size).toBe(COMPARE.rows.length);
  });

  it("gives every process step the reader's time, and keeps our list longer than theirs", () => {
    expect(PROCESS.steps.length).toBeGreaterThanOrEqual(3);
    expect(PROCESS.steps.length).toBeLessThanOrEqual(5);
    for (const step of PROCESS.steps) expect(step.time.length).toBeGreaterThan(0);
    expect(ROLES.ours.items.length).toBeGreaterThanOrEqual(ROLES.yours.items.length * 2);
  });

  it("answers the required questions, price first, and does not invent a guarantee", () => {
    const topics = LANDING_FAQ.items.map((item) => item.topic);
    for (const topic of ["price", "guarantee", "who", "how-long", "not-working"]) expect(topics).toContain(topic);
    expect(topics[0]).toBe("price");
    for (const item of LANDING_FAQ.items) expect(item.q.endsWith("?"), item.q).toBe(true);
    const guarantee = LANDING_FAQ.items.find((item) => item.topic === "guarantee")!;
    expect(guarantee.a.startsWith("No.")).toBe(true);
    expect(COPY).not.toMatch(/money[- ]back|guaranteed|risk[- ]free/i);
  });

  it("states the real price, credits, packs and check-in choices", () => {
    expect(OFFER.price).toBe(`$${PLAN.priceCents / 100}`);
    expect(OFFER.credits).toContain(`$${PLAN.includedCents / 100}`);
    const price = LANDING_FAQ.items[0].a;
    expect(price).toContain(`$${PLAN.priceCents / 100}`);
    for (const cents of TOPUP_PACKS_CENTS) expect(price).toContain(`$${cents / 100}`);
    expect(COPY).toContain(CHECK_IN_DAYS.join(", ").replace(/, (\d+)$/, " or $1"));
    expect(COPY).not.toMatch(/\$99|\$50 of credits/);
  });

  it("draws the loop as study, propose, you approve, try, measure", () => {
    expect(LOOP.steps.map((step) => step.id)).toEqual(["study", "propose", "approve", "try", "measure"]);
  });

  it("shows only real screens, each with its file and a description", () => {
    expect(PICTURES.map((picture) => picture.id)).toEqual([
      "offer-compare",
      "ad-set",
      "page-teardown",
      "tasks-board",
      "briefing-approval",
      "home",
      "organizations-clients",
      "test-plan",
      "tasks-result",
    ]);
    for (const picture of PICTURES) {
      expect(picture.on, picture.id).toBe(true);
      expect(picture.alt.length, picture.id).toBeGreaterThan(40);
      expect(picture.width * picture.height, picture.id).toBeGreaterThan(0);
      expect(existsSync(join(process.cwd(), "public/marketing/product", `${picture.file}.png`)), picture.id).toBe(true);
    }
    // Industry trend posts are off by default and have not run for a customer, so no picture features them.
    expect(PICTURES.map((picture) => `${picture.title} ${picture.alt}`).join(" ")).not.toMatch(/trend/i);
  });

  it("names a real, available skill wherever it says a skill did the work", () => {
    const available = GROWTH_ARCHITECT.skills.filter((skill) => skill.status === "available").map((skill) => skill.name as string);
    // A fix is handled by an available skill, by every skill, or by the check-ins the app keeps.
    for (const fix of FIXES.items) {
      expect([...available, "Every skill", "Check-ins"], fix.id).toContain(fix.by);
    }
    // A picture of a skill's work names that skill. The rest name the part of the app they show.
    for (const picture of PICTURES) {
      if (picture.place === "fix") expect(available, picture.id).toContain(picture.by);
      else expect(available, picture.id).not.toContain(picture.by);
    }
    // The tour needs a tab and a line for every screen it shows.
    for (const picture of landing.picturesFor("work")) {
      expect(picture.tab, picture.id).toBeTruthy();
      expect(picture.doing, picture.id).toBeTruthy();
    }
    expect(AGENTS_SECTION.departments.flatMap((group) => [...group.agents]).find((agent) => agent.name === landing.LIVE.agent)?.live).toBe(true);
  });

  it("uses no old audience, no old product names, no invented proof and no em dash", () => {
    expect(COPY).not.toMatch(/med(ical)? spa|aesthetic|home services|remodel|cleaning|considered purchase/i);
    expect(COPY).not.toMatch(/\b(Sentry|Scribe|Relay|Compass)\b|GoHighLevel|Ad Library/);
    expect(COPY).not.toMatch(/trusted by|customers love|\d+x |\d+% (more|better|faster)/i);
    expect(COPY).not.toMatch(/—/);
  });
});
