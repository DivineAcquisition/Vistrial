import { v } from "convex/values";

import { requireAccess } from "./access";
import { mutation, query } from "./_generated/server";
import { digestDue, interruptCapped, sideEffectsBlocked } from "./notifyRules";

async function operatorMaySee(
  ctx: import("./_generated/server").MutationCtx,
  workspaceId: string,
  memberLegacyId: string | null,
  leadId: string | null,
): Promise<boolean> {
  if (!leadId) return false;
  const lead = await ctx.db
    .query("leadAccess")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .unique();
  if (!lead || lead.workspaceId !== workspaceId || lead.drifted) return false;
  const unassigned = !lead.setterMemberId && !lead.closerMemberId;
  return unassigned || lead.setterMemberId === memberLegacyId || lead.closerMemberId === memberLegacyId;
}

/** Producers create a notification here. Historic and invisible subjects are refused. */
export const enqueue = mutation({
  args: {
    key: v.string(),
    job: v.string(),
    workspaceId: v.string(),
    legacyId: v.string(),
    eventType: v.string(),
    channel: v.string(),
    recipientUserId: v.optional(v.string()),
    recipientMemberId: v.optional(v.string()),
    leadId: v.optional(v.string()),
    title: v.string(),
    body: v.string(),
    dedupeKey: v.string(),
    sendAfter: v.string(),
    isTest: v.optional(v.boolean()),
    personCount: v.optional(v.number()),
    workspaceCount: v.optional(v.number()),
    historic: v.optional(v.boolean()),
    duplicate: v.optional(v.boolean()),
    replay: v.optional(v.boolean()),
    pausedCatchup: v.optional(v.boolean()),
    occurredBeforeGoLive: v.optional(v.boolean()),
    imported: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireAccess(ctx, {
      scope: "system",
      key: args.key,
      job: args.job,
      workspaceId: args.workspaceId,
    });
    if (
      sideEffectsBlocked({
        historic: args.historic,
        duplicate: args.duplicate,
        replay: args.replay,
        pausedCatchup: args.pausedCatchup,
        occurredBeforeGoLive: args.occurredBeforeGoLive,
        imported: args.imported,
      })
    ) {
      return { id: null as string | null, created: false };
    }
    if (args.recipientMemberId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", args.recipientMemberId as string))
        .unique();
      if (!member || member.workspaceId !== access.workspaceId || !member.active) return { id: null, created: false };
      if (member.role === "operator" || member.role === "setter" || member.role === "closer") {
        const allowed = await operatorMaySee(ctx, access.workspaceId, member.legacyId, args.leadId ?? null);
        if (!allowed) return { id: null, created: false };
      }
      if (member.seat === "staff") {
        const assigned = await ctx.db
          .query("assignments")
          .withIndex("by_workspace_user", (q) => q.eq("workspaceId", access.workspaceId).eq("userId", member.userId))
          .take(5);
        if (!assigned.some((row) => row.active)) return { id: null, created: false };
      }
    }
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
      .take(5);
    if (existing.some((row) => row.status === "queued" && row.workspaceId === access.workspaceId)) {
      return { id: existing[0]?.legacyId ?? null, created: false };
    }
    const decision = interruptCapped({
      personCount: args.personCount ?? 0,
      workspaceCount: args.workspaceCount ?? 0,
      eventType: args.eventType,
      isTest: args.isTest === true,
    });
    const eventType = decision === "summarize" ? "hourly_summary" : args.eventType;
    await ctx.db.insert("notifications", {
      legacyId: args.legacyId,
      workspaceId: access.workspaceId,
      status: "queued",
      queuedAt: new Date().toISOString(),
      recipientUserId: args.recipientUserId,
      recipientMemberId: args.recipientMemberId,
      eventType,
      channel: args.channel,
      dedupeKey: args.dedupeKey,
      leadId: args.leadId,
      sendAfter: args.sendAfter,
      attempt: 0,
      row: {
        id: args.legacyId,
        org_id: access.workspaceId,
        event_type: eventType,
        channel: args.channel,
        title: args.title,
        body: args.body,
        status: "queued",
        dedupe_key: args.dedupeKey,
        lead_id: args.leadId ?? null,
        actor: "system",
        actor_job: access.job,
      },
    });
    return { id: args.legacyId, created: true, eventType };
  },
});

/**
 * Claim a queued notice for sending. The receipt is stored before any provider
 * call, so a retry cannot send it again.
 */
export const claim = mutation({
  args: { key: v.string(), job: v.string(), legacyId: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, platform: true });
    if (args.job !== "notifications") throw new Error("Only the notifications job delivers.");
    const row = await ctx.db
      .query("notifications")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (!row) return { send: false as const, reason: "missing" };
    if (row.receipt) return { send: false as const, reason: "already", receipt: row.receipt };
    if (row.leadId && row.recipientMemberId) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_legacyId", (q) => q.eq("legacyId", row.recipientMemberId as string))
        .unique();
      if (member && (member.role === "operator" || member.role === "setter" || member.role === "closer")) {
        const allowed = await operatorMaySee(ctx, row.workspaceId, member.legacyId, row.leadId);
        if (!allowed) {
          await ctx.db.patch(row._id, { status: "cancelled", row: { ...row.row, status: "cancelled", reason: "not_visible" } });
          return { send: false as const, reason: "not_visible" };
        }
      }
    }
    const receipt = `${row.legacyId}:${(row.attempt ?? 0) + 1}`;
    await ctx.db.patch(row._id, { receipt, attempt: (row.attempt ?? 0) + 1, status: "sending" });
    return { send: true as const, receipt, title: (row.row as { title?: string }).title ?? "" };
  },
});

export const due = query({
  args: { key: v.string(), job: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, platform: true });
    if (args.job !== "notifications") throw new Error("Only the notifications job delivers.");
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(25);
    return rows.map((row) => row.legacyId);
  },
});

export const digestWindow = query({
  args: {
    key: v.string(),
    job: v.string(),
    at: v.string(),
    timeZone: v.string(),
    alreadySentOn: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, platform: true });
    return { due: digestDue(new Date(args.at), args.timeZone, args.alreadySentOn) };
  },
});

export const savePreference = mutation({
  args: {
    key: v.string(),
    job: v.string(),
    workspaceId: v.string(),
    memberId: v.string(),
    eventType: v.string(),
    channel: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, workspaceId: args.workspaceId });
    const legacyId = `${args.memberId}:${args.eventType}:${args.channel}`;
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId))
      .unique();
    const fields = {
      legacyId,
      workspaceId: args.workspaceId,
      memberId: args.memberId,
      eventType: args.eventType,
      channel: args.channel,
      enabled: args.enabled,
      row: { member_id: args.memberId, event_type: args.eventType, channel: args.channel, enabled: args.enabled },
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("notificationPreferences", fields);
    return fields.row;
  },
});
