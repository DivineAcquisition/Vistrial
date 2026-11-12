/**
 * The approvals queue and the one door that decides anything in it. An approval is one decision about one
 * thing, by an Owner or Admin, recorded with who and when. Whatever is being decided keeps its own rules:
 * an asset must still have a source for every claim, a restricted step in a connected account needs the
 * Owner and the typed word, a task starts its work. The rule of what needs approval is lib/approvals.ts.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { approveTask, declineTask } from "./agentTasks";
import { approveAsset, rejectAsset } from "./assets";
import { decideStep } from "./browserAccess";
import { APPROVAL_KIND_LABEL, NOT_WAITING_WORDS, SPEND_LIMIT_MAX, SPEND_LIMIT_MIN, mayDecide, recordDecision, requireDecider } from "./lib/approvals";
import { writeAudit } from "./lib/audit";
import { askApproval, askAssetReview, settingsOf } from "./lib/briefing";
import { adminMutation, workspaceQuery } from "./lib/builders";
import { SKILL_CAPS } from "./lib/caps";
import { priceFor } from "./lib/credits";
import { CONFIRM_WORD, RESTRICTED_REASONS, type RestrictedReason } from "./lib/browserAgent/policy";
import { notFound, userError } from "./lib/errors";
import { isAdmin } from "./lib/roles";
import { stepApproval } from "./browserAccess";

const QUEUE_LIMIT = 100;

type Access = MutationCtx & { workspaceId: Id<"workspaces">; identity: { subject: string }; member: Doc<"members">; role: string };

/** Where the thing being decided can be read in full. */
function hrefOf(approval: Doc<"approvals">) {
  if (approval.subjectTable === "assets") return `/app/assets/${approval.subjectId}`;
  if (approval.subjectTable === "browserSteps") return "/app/connections/browser";
  if (approval.subjectTable === "agentTasks") return "/app/tasks";
  return null;
}

/** What approving a restricted step asks the Owner to type, if this approval is one. */
async function confirmFor(ctx: { db: MutationCtx["db"] | import("./_generated/server").QueryCtx["db"] }, approval: Doc<"approvals">) {
  if (approval.subjectTable !== "browserSteps" || !approval.ownerOnly) return null;
  const id = ctx.db.normalizeId("browserSteps", approval.subjectId);
  const step = id ? await ctx.db.get(id) : null;
  const reason = (step?.restrictedReason ?? "publish") as RestrictedReason;
  return { word: CONFIRM_WORD[reason], why: RESTRICTED_REASONS[reason] };
}

export async function approvalView(ctx: { db: import("./_generated/server").QueryCtx["db"]; role: string }, approval: Doc<"approvals">) {
  return {
    id: approval._id,
    kind: approval.kind,
    kindLabel: APPROVAL_KIND_LABEL[approval.kind],
    summary: approval.summary,
    credits: approval.credits ?? null,
    agentSlug: approval.agentSlug ?? null,
    clientId: approval.clientId ?? null,
    status: approval.status,
    requestedAt: approval.requestedAt,
    decidedAt: approval.decidedAt ?? null,
    href: hrefOf(approval),
    /** A draft is declined with a reason, which is saved as feedback. */
    needsReason: approval.subjectTable === "assets",
    ownerOnly: approval.ownerOnly === true,
    confirm: await confirmFor(ctx, approval),
    canDecide: approval.status === "waiting" && mayDecide(ctx.role, approval),
  };
}

/** What is waiting for a decision, oldest first. Everyone sees the queue for the clients they may see; Owners and Admins decide. */
export const waiting = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("approvals")
      .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", "waiting"))
      .take(QUEUE_LIMIT);
    const items = [];
    for (const row of rows) items.push(await approvalView(ctx, row));
    return { items, canApprove: isAdmin(ctx.role) };
  },
});

/**
 * Decides one waiting approval. Owners and Admins; an Owner-only one is the Owner's alone. The decision is
 * carried out by the rules of what is being decided, and recorded once, here or by those rules.
 */
export const decide = adminMutation({
  args: { approvalId: v.id("approvals"), approve: v.boolean(), reason: v.optional(v.string()), confirmWord: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.workspaceId !== ctx.workspaceId) notFound();
    if (approval.status !== "waiting") throw userError(NOT_WAITING_WORDS);
    requireDecider(ctx.role, approval);
    await carryOut(ctx, approval, args);
    const after = await ctx.db.get(approval._id);
    // A subject with rules of its own records the decision itself. Anything else is recorded here.
    if (after?.status === "waiting") {
      await recordDecision(ctx, { workspaceId: approval.workspaceId, clientId: approval.clientId, kind: approval.kind, subjectTable: approval.subjectTable, subjectId: approval.subjectId, summary: approval.summary, status: args.approve ? "approved" : "declined", actor: ctx.identity.subject });
    }
    return { status: args.approve ? ("approved" as const) : ("declined" as const) };
  },
});

async function carryOut(ctx: Access, approval: Doc<"approvals">, args: { approve: boolean; reason?: string; confirmWord?: string }) {
  if (approval.subjectTable === "assets") {
    const id = ctx.db.normalizeId("assets", approval.subjectId);
    const asset = id ? await ctx.db.get(id) : null;
    if (!asset || asset.workspaceId !== ctx.workspaceId) notFound();
    if (args.approve) await approveAsset(ctx, asset);
    else await rejectAsset(ctx, asset, args.reason ?? "");
    return;
  }
  if (approval.subjectTable === "browserSteps") {
    const id = ctx.db.normalizeId("browserSteps", approval.subjectId);
    if (!id) notFound();
    await decideStep(ctx, { stepId: id, approve: args.approve, confirmWord: args.confirmWord });
    return;
  }
  if (approval.subjectTable === "agentTasks") {
    const id = ctx.db.normalizeId("agentTasks", approval.subjectId);
    const task = id ? await ctx.db.get(id) : null;
    if (!task || task.workspaceId !== ctx.workspaceId) notFound();
    if (args.approve) await approveTask(ctx, task);
    else await declineTask(ctx, task, args.reason);
  }
}

/** The organization's approval settings: the spending limit and the two switches. Everyone reads; Owners and Admins change. */
export const settings = workspaceQuery({
  args: {},
  handler: async (ctx) => ({
    ...(await settingsOf(ctx, ctx.workspaceId)),
    canEdit: isAdmin(ctx.role),
    min: SPEND_LIMIT_MIN,
    max: SPEND_LIMIT_MAX,
    /** The most one month of industry trend posts can use, in credits: shown before they are switched on. */
    trendCapCredits: priceFor(SKILL_CAPS["industry-trends"].maxCostCentsPerRun),
  }),
});

async function patchSettings(ctx: Access, patch: Partial<Doc<"workspaceSettings">>) {
  const row = await ctx.db
    .query("workspaceSettings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
    .unique();
  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("workspaceSettings", { workspaceId: ctx.workspaceId, setupDone: false, themeDefault: "light", ...patch });
}

/**
 * Sets the spending limit: agent work that may use more credits than this waits for an Owner or Admin.
 * `credits: null` removes it, leaving the agent caps alone. Owners and Admins.
 */
export const setSpendLimit = adminMutation({
  args: { credits: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    if (args.credits !== null && (!Number.isInteger(args.credits) || args.credits < SPEND_LIMIT_MIN || args.credits > SPEND_LIMIT_MAX)) {
      throw userError(`Enter a whole number of credits between ${SPEND_LIMIT_MIN.toLocaleString("en-US")} and ${SPEND_LIMIT_MAX.toLocaleString("en-US")}.`);
    }
    await patchSettings(ctx, { spendApprovalCredits: args.credits ?? undefined });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: args.credits === null ? "settings.spendLimit.removed" : "settings.spendLimit.set", subject: ctx.workspaceId, count: args.credits ?? undefined });
    return null;
  },
});

/** Switches the weekly plan (and growth report) or industry trend posts on or off for the organization. Owners and Admins. */
export const setSwitch = adminMutation({
  args: { key: v.union(v.literal("weeklyPlan"), v.literal("trendPosts")), on: v.boolean() },
  handler: async (ctx, args) => {
    await patchSettings(ctx, { [args.key]: args.on });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: `settings.${args.key}.${args.on ? "on" : "off"}`, subject: ctx.workspaceId });
    return null;
  },
});

const PAGE = 50;

/**
 * Drafts and connected-account steps that were already waiting when approvals arrived get their row in the
 * queue. Pages through each table once and reschedules itself; a row that has one is left alone, so
 * running it again changes nothing.
 */
export const backfill = internalMutation({
  args: { table: v.optional(v.union(v.literal("assets"), v.literal("browserSteps"))), cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const table = args.table ?? "assets";
    const opts = { numItems: PAGE, cursor: args.cursor ?? null };
    if (table === "assets") {
      const page = await ctx.db.query("assets").paginate(opts);
      for (const asset of page.page) await askAssetReview(ctx, asset);
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.approvals.backfill, { table, cursor: page.continueCursor });
      else await ctx.scheduler.runAfter(0, internal.approvals.backfill, { table: "browserSteps", cursor: null });
      return null;
    }
    const page = await ctx.db.query("browserSteps").paginate(opts);
    for (const step of page.page) {
      if (step.status === "proposed") await askApproval(ctx, { ...stepApproval(step), requestedBy: "agent" }, { title: "Approve a change in a connected account", body: `${step.verb} ${step.target}. ${step.why}` });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.approvals.backfill, { table, cursor: page.continueCursor });
    return null;
  },
});

const BACKFILLED = "approvals.backfilled";

/** Runs the backfill once on a deployment. The audit log holds the mark that it finished starting. */
export const backfillIfNeeded = internalMutation({
  args: {},
  handler: async (ctx) => {
    const marks = await ctx.db
      .query("auditLog")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", undefined))
      .order("desc")
      .take(200);
    if (marks.some((row) => row.action === BACKFILLED)) return null;
    await writeAudit(ctx, { actorType: "system", actorId: "runtime", action: BACKFILLED, subject: "approvals" });
    await ctx.scheduler.runAfter(0, internal.approvals.backfill, {});
    return null;
  },
});
