/**
 * A pre-call brief is ready: one email to the closer (docs/rebuild/dealmaker.md, 0.8 "Delivered"). The closer is
 * the team member linked to the deal's owner in the CRM; with none linked, the person who asked. The person who
 * asked for the brief is watching the Calls tab, so they get no email for their own request. The email names the
 * lead and the call only; the brief stays in Vistrial.
 *
 * A send never throws into a run. With no RESEND_API_KEY it logs one line and sends nothing. Each attempt
 * writes an audit row with the recipient's user id, never the address.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { appUrl, resendKey, send } from "./emailReminders";
import { writeAudit } from "./lib/audit";
import { crmFor } from "./lib/crm/read";
import { preCallBriefEmail } from "./lib/reminderEmail";
import { settingsOf } from "./playbookInterview";
import { when } from "./skills/dealBriefing/compute";

export const BRIEF_ACTION = "email.pre_call_brief";

/** Who the brief is for, and what the email says. Null when nobody needs telling. */
export const briefToAnnounce = internalQuery({
  args: { briefingId: v.id("dealBriefings") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.briefingId);
    if (!row || row.status !== "ready") return null;
    const workspace = await ctx.db.get(row.workspaceId);
    if (!workspace || workspace.status !== "active") return null;
    const controls = await ctx.db
      .query("workspaceControls")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", row.workspaceId))
      .unique();
    if (controls?.agentsPaused === true) return null;

    // The closer: the member whose CRM user owns this lead's deal.
    const scope = { workspaceId: row.workspaceId, ...(row.clientId ? { clientId: row.clientId } : {}) };
    const crm = await crmFor(ctx, scope);
    let ownerRef: string | null = null;
    if (crm && row.contactRef) {
      const deal = row.dealRef ? await crm.deal(row.dealRef) : ((await crm.deals({ open: true })).filter((d) => d.contactRef === row.contactRef).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null);
      ownerRef = deal?.ownerRef ?? null;
    }
    const team = (await settingsOf(ctx, scope))?.team ?? [];
    const closerId = ownerRef ? team.find((item) => item.crmUserRef === ownerRef)?.memberId : undefined;
    const closerDoc = closerId ? ctx.db.normalizeId("members", closerId) : null;
    const closer = closerDoc ? await ctx.db.get(closerDoc) : null;
    const live = (member: Doc<"members"> | null | undefined) => (member && member.workspaceId === row.workspaceId && member.active && member.removedAt === undefined ? member : null);
    let recipient = live(closer);
    // An automatic brief with no linked closer goes to the person who set it up.
    if (!recipient && row.trigger === "auto") {
      const members = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", row.workspaceId))
        .take(200);
      recipient = live(members.find((item) => item.userId === row.createdBy));
    }
    // A closer who asked for their own brief is already watching the Calls tab.
    if (!recipient || (row.trigger === "request" && recipient.userId === row.createdBy)) return null;
    const email = recipient.email?.trim();
    if (!email || !email.includes("@")) return null;
    const prefs = await ctx.db
      .query("memberPreferences")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", row.workspaceId).eq("userId", recipient.userId))
      .unique();
    if (prefs?.notifyByEmail === false) return null;
    return {
      workspaceId: row.workspaceId,
      workspaceName: workspace.name,
      leadName: row.leadName,
      when: row.startsAt ? when(row.startsAt, crm?.connection.timezone ?? null) : null,
      recipient: { userId: recipient.userId, email },
    };
  },
});

export const recordBrief = internalMutation({
  args: { workspaceId: v.id("workspaces"), briefingId: v.id("dealBriefings"), userId: v.string(), sent: v.boolean() },
  handler: async (ctx, args) => {
    await writeAudit(ctx, { workspaceId: args.workspaceId, actorType: "system", actorId: "email", action: BRIEF_ACTION, subject: `${args.briefingId}:${args.userId}`, count: args.sent ? 1 : 0 });
    return null;
  },
});

/** Scheduled by the brief's save step. Never throws. */
export const sendBriefReady = internalAction({
  args: { briefingId: v.id("dealBriefings") },
  handler: async (ctx, args): Promise<null> => {
    try {
      const brief = await ctx.runQuery(internal.briefEmail.briefToAnnounce, { briefingId: args.briefingId });
      if (!brief) return null;
      const key = resendKey();
      if (!key) console.log("Pre-call brief email skipped: RESEND_API_KEY is not set.");
      const message = preCallBriefEmail({ workspaceName: brief.workspaceName, leadName: brief.leadName, when: brief.when, briefingId: args.briefingId, appUrl: appUrl() });
      const sent = key ? await send(key, brief.recipient.email, `pre-call-brief/${args.briefingId}/${brief.recipient.userId}`, message) : false;
      await ctx.runMutation(internal.briefEmail.recordBrief, { workspaceId: brief.workspaceId, briefingId: args.briefingId, userId: brief.recipient.userId, sent });
    } catch {
      console.error("Pre-call brief email failed.");
    }
    return null;
  },
});
