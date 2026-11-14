import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../convex/catalog";
import { DOCTRINE_STEPS, THE_STANDARD } from "../../../convex/skills/dealmaker/doctrine";
import { AGENTS_SECTION, HOW, SOURCES } from "@/lib/marketing/content";
import { WORK_TABS } from "../../../convex/lib/workTabs";
import { AGENT_PAGES, DEALMAKER_PAGE, STRATEGIST_PAGE, agentOfPage, agentPageFor, agentPageHref } from "@/lib/marketing/agent-pages";
import { PUBLIC_PAGES } from "@/lib/seo";

const words = (page: (typeof AGENT_PAGES)[number]) => JSON.stringify(page);

describe("agent pages", () => {
  it("each page is about a catalog agent, has a unique address and is in the sitemap", () => {
    const slugs = AGENT_PAGES.map((page) => page.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const page of AGENT_PAGES) {
      expect(CATALOG.some((row) => row.slug === page.agentSlug)).toBe(true);
      expect(agentPageFor(page.slug)).toBe(page);
      expect(PUBLIC_PAGES.some((row) => row.path === `/agents/${page.slug}`)).toBe(true);
    }
    expect(agentPageFor("nobody")).toBeNull();
  });

  it("the homepage card links to the page the catalog agent has", () => {
    const cards = AGENTS_SECTION.departments.flatMap((group) => [...group.agents]);
    for (const page of AGENT_PAGES) {
      const agent = agentOfPage(page);
      const card = cards.find((row) => row.name === agent.name);
      expect(card && "page" in card ? card.page : null).toBe(agentPageHref(agent.slug));
    }
  });

  it("an agent that is not live says so, and is never called live", () => {
    for (const page of AGENT_PAGES) {
      const agent = agentOfPage(page);
      if (agent.status === "live") continue;
      expect(page.notYet).toMatch(/does not run yet/);
      expect(page.cta.headline).not.toMatch(/\blive\b/i);
    }
  });

  it("Dealmaker's page carries the doctrine the product uses", () => {
    expect(agentOfPage(DEALMAKER_PAGE).name).toBe("Dealmaker");
    expect(DEALMAKER_PAGE.doctrine.steps).toBe(DOCTRINE_STEPS);
    expect(DEALMAKER_PAGE.standard.items).toBe(THE_STANDARD);
    expect(DEALMAKER_PAGE.principles.items.map((row) => row.numeral)).toEqual(["I", "II", "III", "IV", "V", "VI"]);
    expect(DEALMAKER_PAGE.tabs.items.map((row) => row.name)).toEqual(["Chat", "Calendar", "Pipeline", "Calls", "Comms", "Playbook"]);
    expect(agentOfPage(DEALMAKER_PAGE).skills).toHaveLength(6);
  });

  it("Strategist's page is about the live agent and uses the homepage's own steps and sources", () => {
    const agent = agentOfPage(STRATEGIST_PAGE);
    expect(agent.name).toBe("Strategist");
    expect(agent.status).toBe("live");
    expect(STRATEGIST_PAGE.doctrine.steps.map((row) => row.name)).toEqual(HOW.steps.map((row) => row.title));
    expect(STRATEGIST_PAGE.connects.items.map((row) => row.label)).toEqual(SOURCES.items.map((row) => row.label));
    expect(STRATEGIST_PAGE.principles.items.map((row) => row.numeral)).toEqual(["I", "II", "III", "IV", "V", "VI"]);
    // Every work tab the app gives Strategist is described on the page.
    const tabs = STRATEGIST_PAGE.tabs.items.map((row) => row.id);
    for (const tab of ["chat", ...WORK_TABS, "creative", "pages"]) expect(tabs).toContain(tab);
    expect(agent.skills).toHaveLength(7);
  });

  it("public words name no model, no credits and no score", () => {
    for (const page of AGENT_PAGES) {
      expect(words(page)).not.toMatch(/\b(Claude|GPT|Gemini|Opus|Sonnet|credits?|lead score)\b/i);
      // The app's roles are Owner, Admin, Member and Viewer (convex/lib/roles.ts).
      expect(words(page)).not.toMatch(/\bManager\b/);
    }
  });
});
