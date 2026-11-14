/**
 * The doctrine is built in, not just written down: every Dealmaker skill's instructions to the model start
 * from it, and it carries the five steps and the standard the owner set (docs/rebuild/dealmaker.md, 0.0).
 */
import { describe, expect, it } from "vitest";

import { CATALOG } from "../../catalog";
import { skillFor } from "../../lib/skills";
import { SYSTEM as PIPELINE_SYSTEM } from "../pipelineForensics";
import { SYSTEM as BRIEFING_SYSTEM } from "../dealBriefing";
import { SYSTEM as REVIEW_SYSTEM } from "../callReview";
import { SYSTEM as FOLLOW_UP_SYSTEM } from "../followUpEngine";
import { SYSTEM as PROPOSAL_SYSTEM } from "../proposalArchitect";
import { DOCTRINE_PROMPT, DOCTRINE_STEPS, THE_STANDARD } from "./doctrine";

/** Each built Dealmaker skill's system instructions. A new skill adds its own here. */
const SYSTEMS: Record<string, string> = { "pipeline-forensics": PIPELINE_SYSTEM, "deal-briefing": BRIEFING_SYSTEM, "conversation-intelligence": REVIEW_SYSTEM, "follow-up-engine": FOLLOW_UP_SYSTEM, "proposal-architect": PROPOSAL_SYSTEM };

describe("Dealmaker's doctrine", () => {
  it("names the five steps and the five questions of the standard, in order", () => {
    expect(DOCTRINE_STEPS.map((step) => step.name)).toEqual(["Observe", "Understand", "Commit", "Follow Through", "Learn"]);
    expect(THE_STANDARD).toEqual(["What happened?", "What supports that understanding?", "What remains unresolved?", "Who owns the next action?", "What did we learn?"]);
    for (const question of THE_STANDARD) expect(DOCTRINE_PROMPT).toContain(question);
  });

  it("is where every built Dealmaker skill's instructions start", () => {
    const dealmaker = CATALOG.find((agent) => agent.slug === "sales-conversion")!;
    const built = dealmaker.skills.map((skill) => skill.slug).filter((slug) => skillFor(slug, true) !== null);
    expect(built.length).toBeGreaterThan(0);
    for (const slug of built) {
      expect(SYSTEMS[slug], `${slug} has no system instructions listed here`).toBeDefined();
      expect(SYSTEMS[slug].startsWith(DOCTRINE_PROMPT), slug).toBe(true);
    }
  });

  it("forbids what the doctrine forbids", () => {
    for (const rule of [/manufacture urgency/, /misrepresent the offer/, /Honour a refusal/, /never turn incomplete data into a verdict about a person/, /never treat one outcome as proof of a cause/]) {
      expect(DOCTRINE_PROMPT).toMatch(rule);
    }
  });
});
