/**
 * The waitlist email when a planned agent goes live: one email to each person who asked ("Notify me when it's
 * live"), through the same Resend path as the other notices (convex/emailReminders.ts). It is run by hand at
 * launch, after the agent is live in the catalog (docs/rebuild/dealmaker.md, the launch checklist); it never
 * runs on its own and refuses an agent that is not live yet. A person who left the workspace, or who turned
 * emails off, gets nothing. Each send is recorded once, so running it again sends no second email.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { CATALOG } from "./catalog";
import { appUrl, resendKey, send } from "./emailReminders";
import { writeAudit } from "./lib/audit";
import { agentLiveEmail } from "./lib/reminderEmail";

export const LAUNCH_ACTION = "email.agent_live";

type Person = { workspaceId: Id<"workspaces">; workspaceName: string; userId: string; email: string };

/** Who asked to be told about this agent and has not been told yet, with an address to tell them at. */
export const waiting = internalQuery({
  args: { agentSlug: v.string() },
  handler: async (ctx, args): Promise<Person[]> => {
    const rows = (await ctx.db.query("agentWaitlist").take(10_000)).filter((row) => row.agentSlug === args.agentSlug);
    const out: Person[] = [];
    for (const row of rows) {
      const sent = await ctx.db
        .query("auditLog")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", row.workspaceId))
        .order("desc")
        .take(2000);
      if (sent.some((entry) => entry.action === LAUNCH_ACTION && entry.subject === `${args.agentSlug}:${row.userId}` && (entry.count ?? 0) > 0)) continue;
      const workspace = await ctx.db.get(row.workspaceId);
      if (!workspace || workspace.archivedAt !== undefined) continue;
      const member = await ctx.db
        .query("members")
        .withIndex("by_workspace_user", (q) => q.eq("workspaceId", row.workspaceId).eq("userId", row.userId))
        .unique();
      if (!member?.active || member.removedAt !== undefined) continue;
      const email = member.email?.trim();
      if (!email || !email.includes("@")) continue;
      const prefs = await ctx.db
        .query("memberPreferences")
        .withIndex("by_workspace_user", (q) => q.eq("workspaceId", row.workspaceId).eq("userId", row.userId))
        .unique();
      if (prefs?.notifyByEmail === false) continue;
      out.push({ workspaceId: row.workspaceId, workspaceName: workspace.name, userId: row.userId, email });
    }
    return out;
  },
});

export const record = internalMutation({
  args: { agentSlug: v.string(), sends: v.array(v.object({ workspaceId: v.id("workspaces"), userId: v.string(), sent: v.boolean() })) },
  handler: async (ctx, args) => {
    // The audit row holds the user id, never the address.
    for (const row of args.sends) await writeAudit(ctx, { workspaceId: row.workspaceId, actorType: "system", actorId: "email", action: LAUNCH_ACTION, subject: `${args.agentSlug}:${row.userId}`, count: row.sent ? 1 : 0 });
    return null;
  },
});

/** Run by hand at launch: tells everyone on the agent's waitlist that it is live. Refuses an agent still planned. */
export const announceLive = internalAction({
  args: { agentSlug: v.string() },
  handler: async (ctx, args): Promise<{ sent: number; skipped: number }> => {
    const agent = CATALOG.find((row) => row.slug === args.agentSlug);
    if (!agent) throw new Error("No such agent.");
    if (agent.status !== "live") throw new Error(`${agent.name} is not live yet, so nobody is told.`);
    const people: Person[] = await ctx.runQuery(internal.agentLaunch.waiting, { agentSlug: agent.slug });
    const key = resendKey();
    if (!key) {
      console.log("Launch email skipped: RESEND_API_KEY is not set.");
      return { sent: 0, skipped: people.length };
    }
    const sends: { workspaceId: Id<"workspaces">; userId: string; sent: boolean }[] = [];
    for (const person of people) {
      const message = agentLiveEmail({ agentName: agent.name, job: agent.job, workspaceName: person.workspaceName, agentSlug: agent.slug, appUrl: appUrl() });
      const sent = await send(key, person.email, `agent-live/${agent.slug}/${person.workspaceId}/${person.userId}`, message);
      sends.push({ workspaceId: person.workspaceId, userId: person.userId, sent });
    }
    await ctx.runMutation(internal.agentLaunch.record, { agentSlug: agent.slug, sends });
    return { sent: sends.filter((row) => row.sent).length, skipped: sends.filter((row) => !row.sent).length };
  },
});
