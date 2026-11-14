/**
 * @vitest-environment edge-runtime
 *
 * Go-live prep for Dealmaker: its work named "Dealmaker · …" where Usage mixes agents, and the waitlist email,
 * which refuses an agent still planned and tells each person who asked once.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { agentLiveEmail } from "./lib/reminderEmail";
import { usageSkillLabel } from "./usage";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const person = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `x|${subject}`, name: subject, email: `${subject}@example.com` });

describe("go-live prep", () => {
  it("names Dealmaker's six kinds of work with the agent, and leaves the Strategist's as they read", () => {
    expect(["pipeline-forensics", "conversation-intelligence", "deal-briefing", "follow-up-engine", "objection-playbook", "proposal-architect"].map((slug) => usageSkillLabel("sales-conversion", slug))).toEqual([
      "Dealmaker · Pipeline review",
      "Dealmaker · Call review",
      "Dealmaker · Pre-call brief",
      "Dealmaker · Follow-ups",
      "Dealmaker · Objection playbook",
      "Dealmaker · Proposal",
    ]);
    expect(usageSkillLabel("growth-architect", "market-intelligence")).toBe("Research");
  });

  it("writes the launch email from the catalog's words, with a link to the agent and nothing about the workspace's data", () => {
    const email = agentLiveEmail({ agentName: "Dealmaker", job: "Turns leads into customers: follow-ups, calls and pipeline.", workspaceName: "Northlight", agentSlug: "sales-conversion", appUrl: "https://app.vistrial.io/" });
    expect(email.subject).toBe("Dealmaker is live on Vistrial");
    expect(email.text).toContain("An Owner or Admin of Northlight turns it on from its page. Nothing runs until then.");
    expect(email.text).toContain("Open Dealmaker: https://app.vistrial.io/app/agents/sales-conversion");
    expect(email.text).toContain("You got this because you asked to be told when Dealmaker is live, in Northlight on Vistrial.");
  });

  it("refuses to announce an agent still planned, and finds each person who asked once, with an address and emails on", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });
    await owner.mutation(api.agentWaitlist.toggle, { workspaceId, agentSlug: "sales-conversion" });
    await member.mutation(api.agentWaitlist.toggle, { workspaceId, agentSlug: "sales-conversion" });
    // Milo turned emails off.
    await t.run(async (ctx) => {
      await ctx.db.insert("memberPreferences", { workspaceId, userId: "milo", notifyByEmail: false, updatedAt: Date.now() });
    });

    await expect(t.action(internal.agentLaunch.announceLive, { agentSlug: "sales-conversion" })).rejects.toThrow(/not live yet/);
    let waiting = await t.query(internal.agentLaunch.waiting, { agentSlug: "sales-conversion" });
    expect(waiting.map((row) => row.userId)).toEqual(["nora"]);
    expect(waiting[0]).toMatchObject({ email: "nora@example.com", workspaceName: "Northlight" });

    await t.mutation(internal.agentLaunch.record, { agentSlug: "sales-conversion", sends: [{ workspaceId, userId: "nora", sent: true }] });
    waiting = await t.query(internal.agentLaunch.waiting, { agentSlug: "sales-conversion" });
    expect(waiting).toEqual([]);
  });
});
