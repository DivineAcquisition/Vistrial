/**
 * @vitest-environment edge-runtime
 *
 * Go-live prep for Dealmaker: its work named "Dealmaker · …" where Usage mixes agents, and the waitlist email,
 * which refuses an agent still planned and tells each person who asked for Dealmaker once.
 */
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";

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

  it("refuses to announce an agent still planned, and tells each person who asked for Dealmaker once, with an address and emails on", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity(person("nora"));
    const workspaceId = await owner.mutation(api.workspace.create, { name: "Northlight" });
    const invite = await owner.mutation(api.workspace.invite, { workspaceId, email: "milo@example.com", role: "member" });
    const member = t.withIdentity(person("milo"));
    await member.mutation(api.workspace.acceptInvite, { token: invite.token });
    // Both asked while Dealmaker was planned; Milo turned emails off.
    await t.run(async (ctx) => {
      for (const userId of ["nora", "milo"]) await ctx.db.insert("agentWaitlist", { workspaceId, agentSlug: "sales-conversion", userId, at: 1 });
      await ctx.db.insert("memberPreferences", { workspaceId, userId: "milo", notifyByEmail: false, updatedAt: Date.now() });
    });

    await expect(t.action(internal.agentLaunch.announceLive, { agentSlug: "retention" })).rejects.toThrow(/not live yet/);
    const waiting = await t.query(internal.agentLaunch.waiting, { agentSlug: "sales-conversion" });
    expect(waiting.map((row) => row.userId)).toEqual(["nora"]);
    expect(waiting[0]).toMatchObject({ email: "nora@example.com", workspaceName: "Northlight" });

    vi.stubEnv("RESEND_API_KEY", "re_test");
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)).to[0]);
      return new Response(JSON.stringify({ id: "email1" }), { status: 200 });
    });
    try {
      expect(await t.action(internal.agentLaunch.announceLive, { agentSlug: "sales-conversion" })).toEqual({ sent: 1, skipped: 0 });
      expect(sent).toEqual(["nora@example.com"]);
      // A second run sends nothing new.
      expect(await t.action(internal.agentLaunch.announceLive, { agentSlug: "sales-conversion" })).toEqual({ sent: 0, skipped: 0 });
      expect(await t.query(internal.agentLaunch.waiting, { agentSlug: "sales-conversion" })).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
