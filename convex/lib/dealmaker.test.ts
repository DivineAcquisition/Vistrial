/**
 * Dealmaker's skeleton (docs/rebuild/dealmaker.md, step 5): its six skills are in the catalog under their
 * public names, worded for the app by the agent and what it produced, each with its own caps. Live with all six
 * available; its chat and tabs are its own (convex/dealmakerChat.ts, DEALMAKER_TABS), never the Strategist's.
 */
import { describe, expect, it } from "vitest";

import { CATALOG } from "../catalog";
import { chatAgentOf, hasChat, hasWorkTabs } from "./agentSurfaces";
import { SKILL_CAPS } from "./caps";
import { agentWork, workOutput } from "./workWords";

const DEALMAKER = CATALOG.find((agent) => agent.slug === "sales-conversion")!;
const SKILLS = [
  ["pipeline-forensics", "Pipeline Forensics", "Dealmaker · Pipeline review", "a pipeline review"],
  ["conversation-intelligence", "Conversation Intelligence", "Dealmaker · Call review", "a call review"],
  ["deal-briefing", "Deal Briefing", "Dealmaker · Pre-call brief", "a pre-call brief"],
  ["follow-up-engine", "Follow-up Engine", "Dealmaker · Follow-ups", "a follow-up list"],
  ["objection-playbook", "Objection Playbook", "Dealmaker · Objection playbook", "an objection playbook"],
  ["proposal-architect", "Proposal Architect", "Dealmaker · Proposal", "a proposal"],
] as const;

describe("Dealmaker's skeleton", () => {
  it("lists the six skills the owner chose, in order, under their public names", () => {
    expect(DEALMAKER).toMatchObject({ name: "Dealmaker", department: "sales", lifecycle: "Convert", status: "live" });
    expect(DEALMAKER.skills.map((skill) => [skill.slug, skill.name])).toEqual(SKILLS.map(([slug, name]) => [slug, name]));
  });

  it("words each one in the app by the agent and what it produced, never by the skill's name", () => {
    for (const [slug, , label, output] of SKILLS) {
      expect(agentWork("sales-conversion", slug)).toBe(label);
      expect(agentWork(null, slug)).toBe(label);
      expect(workOutput(slug)).toBe(output);
    }
  });

  it("gives each skill its own caps, at most the design's numbers", () => {
    const most: Record<string, number> = { "pipeline-forensics": 100, "conversation-intelligence": 60, "deal-briefing": 25, "follow-up-engine": 100, "objection-playbook": 150, "proposal-architect": 100 };
    for (const [slug] of SKILLS) {
      expect(SKILL_CAPS[slug], slug).toBeDefined();
      expect(SKILL_CAPS[slug].maxCostCentsPerRun).toBe(most[slug]);
      expect(SKILL_CAPS[slug].maxCostCentsPerDay).toBeGreaterThanOrEqual(SKILL_CAPS[slug].maxCostCentsPerRun);
    }
  });

  it("is live with every skill available, its own chat and tabs, and none of its work routed by the Strategist's chat", () => {
    expect(DEALMAKER.skills.every((skill) => skill.status === "available")).toBe(true);
    expect(DEALMAKER.job).not.toMatch(/^Will /);
    expect(DEALMAKER.promise).toBe("Dealmaker never sends a message, sets a price or marks a deal won or lost on its own. A person approves each one.");
    // The Strategist's shared chat and work tabs are not Dealmaker's: it has its own chat and six tabs.
    expect(hasChat("sales-conversion")).toBe(false);
    expect(hasWorkTabs("sales-conversion")).toBe(false);
    for (const [slug] of SKILLS) expect(chatAgentOf(slug)).toBeNull();
  });
});
