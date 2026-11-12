/**
 * The approval rule, in one place: what needs an Owner's or Admin's decision, who may give it, and the
 * organization's spending limit. Every door that approves anything (the Briefing, the Tasks board, the
 * asset page, the connected-account page) records its decision through `recordDecision`, so there is one
 * queue and one record of who decided what and when.
 *
 * What needs approval (the owner's decision, docs/rebuild/tasks-briefing-home.md):
 *   publish        anything that goes public: a report, ad copy, a page change. Always.
 *   spend          agent work that may use more credits than the organization's limit. Only above the limit.
 *   accountChange  a change inside a connected account. Always; a restricted step is the Owner's alone.
 *   housekeeping   archiving old chats, deleting drafts, merging records. Always.
 *   task           a task an agent wants to run. Always.
 * Who may decide: Owners and Admins. A Member may propose and comment; a Viewer reads.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { writeAudit } from "./audit";
import { creditWords, priceFor } from "./credits";
import { notAllowed, userError } from "./errors";
import { isAdmin, isOwner, type Role } from "./roles";
import type { ApprovalKind, ApprovalStatus } from "./taskShapes";

export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = {
  publish: "Going public",
  spend: "Spending above your limit",
  accountChange: "A change in a connected account",
  housekeeping: "Housekeeping",
  task: "A task an agent wants to run",
};

/** The smallest and largest limit an organization can set, in credits. */
export const SPEND_LIMIT_MIN = 1;
export const SPEND_LIMIT_MAX = 100_000;

/** Does this need an Owner's or Admin's decision before it happens? `limit` is the organization's, in credits; missing means none is set. */
export function needsApproval(input: { kind: ApprovalKind; credits?: number; limit?: number | null }): boolean {
  if (input.kind !== "spend") return true;
  if (input.limit === undefined || input.limit === null) return false;
  return (input.credits ?? 0) > input.limit;
}

/** May a person with this role decide this approval? Owners and Admins; an Owner-only one is the Owner's alone. */
export function mayDecide(role: Role | string, approval: { ownerOnly?: boolean }): boolean {
  return approval.ownerOnly ? isOwner(role) : isAdmin(role);
}

export const OWNER_ONLY_WORDS = "Only an Owner can decide this one.";
export const NOT_WAITING_WORDS = "This is no longer waiting for a decision.";

/** Refuses a person who may not decide. A Member and a Viewer get the plain "Not allowed." */
export function requireDecider(role: Role | string, approval: { ownerOnly?: boolean }) {
  if (!isAdmin(role)) notAllowed();
  if (approval.ownerOnly && !isOwner(role)) throw userError(OWNER_ONLY_WORDS, "not_allowed");
}

export async function spendLimit(ctx: QueryCtx, workspaceId: Id<"workspaces">): Promise<number | null> {
  const settings = await ctx.db
    .query("workspaceSettings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  return settings?.spendApprovalCredits ?? null;
}

type Subject = { subjectTable: string; subjectId: string };

async function rowsFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, subject: Subject) {
  return ctx.db
    .query("approvals")
    .withIndex("by_subject", (q) => q.eq("workspaceId", workspaceId).eq("subjectTable", subject.subjectTable).eq("subjectId", subject.subjectId))
    .take(20);
}

export type ApprovalRequest = Subject & {
  workspaceId: Id<"workspaces">;
  clientId?: Id<"clients">;
  kind: ApprovalKind;
  summary: string;
  credits?: number;
  ownerOnly?: boolean;
  agentSlug?: string;
  /** A person's user id, or "agent". */
  requestedBy: string;
};

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Asks for a decision. One waiting row per subject: asking again for something already waiting returns the
 * row that is there. The Briefing post that carries it is written by the caller (lib/briefing.ts).
 */
export async function requestApproval(ctx: MutationCtx, request: ApprovalRequest): Promise<{ approvalId: Id<"approvals">; created: boolean }> {
  const waiting = (await rowsFor(ctx, request.workspaceId, request)).find((row) => row.status === "waiting");
  if (waiting) return { approvalId: waiting._id, created: false };
  const approvalId = await ctx.db.insert("approvals", {
    workspaceId: request.workspaceId,
    ...(request.clientId ? { clientId: request.clientId } : {}),
    kind: request.kind,
    subjectTable: request.subjectTable,
    subjectId: request.subjectId,
    summary: clip(request.summary, 300),
    ...(request.credits !== undefined ? { credits: request.credits } : {}),
    ...(request.ownerOnly ? { ownerOnly: true } : {}),
    ...(request.agentSlug ? { agentSlug: request.agentSlug } : {}),
    status: "waiting",
    requestedBy: request.requestedBy,
    requestedAt: Date.now(),
  });
  await writeAudit(ctx, { workspaceId: request.workspaceId, actorType: request.requestedBy === "agent" ? "system" : "user", actorId: request.requestedBy, action: `approval.requested.${request.kind}`, subject: approvalId });
  return { approvalId, created: true };
}

/**
 * Records a decision on a subject: who, when, and which way. If something was waiting it is settled; if
 * nothing was (a draft from before approvals existed) a decided row is written, so the record is complete
 * whichever door was used. `actor` is a user id, or "system" when silence or a stop ended the wait.
 */
export async function recordDecision(
  ctx: MutationCtx,
  decision: Omit<ApprovalRequest, "requestedBy"> & { status: Exclude<ApprovalStatus, "waiting">; actor: string },
): Promise<Id<"approvals">> {
  const now = Date.now();
  const waiting = (await rowsFor(ctx, decision.workspaceId, decision)).find((row) => row.status === "waiting");
  const decided = { status: decision.status, decidedBy: decision.actor, decidedAt: now };
  let approvalId: Id<"approvals">;
  if (waiting) {
    await ctx.db.patch(waiting._id, decided);
    approvalId = waiting._id;
  } else {
    approvalId = await ctx.db.insert("approvals", {
      workspaceId: decision.workspaceId,
      ...(decision.clientId ? { clientId: decision.clientId } : {}),
      kind: decision.kind,
      subjectTable: decision.subjectTable,
      subjectId: decision.subjectId,
      summary: clip(decision.summary, 300),
      ...(decision.credits !== undefined ? { credits: decision.credits } : {}),
      ...(decision.ownerOnly ? { ownerOnly: true } : {}),
      ...(decision.agentSlug ? { agentSlug: decision.agentSlug } : {}),
      requestedBy: decision.actor,
      requestedAt: now,
      ...decided,
    });
  }
  await writeAudit(ctx, { workspaceId: decision.workspaceId, actorType: decision.actor === "system" ? "system" : "user", actorId: decision.actor, action: `approval.${decision.status}.${decision.kind}`, subject: approvalId });
  return approvalId;
}

/** The waiting approval for a subject, if there is one. */
export async function waitingFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, subject: Subject): Promise<Doc<"approvals"> | null> {
  return (await rowsFor(ctx, workspaceId, subject)).find((row) => row.status === "waiting") ?? null;
}

/** How long an approved spend stays usable before the run it was for must have started. */
export const SPEND_APPROVAL_DAYS = 7;

export function spendWords(credits: number, limit: number) {
  return `This can use up to ${creditWords(credits)}. Work above ${creditWords(limit)} waits for an Owner or Admin here. Ask one of them to start it, or propose it on the Tasks board so they can approve it.`;
}

/**
 * The spending limit, where agent work starts. An Owner or Admin starting work is their own decision. For
 * anyone else, work whose run cap is above the organization's limit goes ahead only on an approved task or
 * spend for the same skill and client that has not been used yet; that approval is then used up, so one
 * approval covers one run. With no limit set, nothing changes.
 */
export async function requireSpendApproval(
  ctx: MutationCtx,
  input: { workspaceId: Id<"workspaces">; role: string; skillSlug: string; clientId?: Id<"clients">; maxCostCentsPerRun: number },
): Promise<Id<"approvals"> | null> {
  if (isAdmin(input.role)) return null;
  const limit = await spendLimit(ctx, input.workspaceId);
  const credits = priceFor(input.maxCostCentsPerRun);
  if (!needsApproval({ kind: "spend", credits, limit })) return null;
  const since = Date.now() - SPEND_APPROVAL_DAYS * 24 * 60 * 60 * 1000;
  const approved = await ctx.db
    .query("approvals")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", input.workspaceId).eq("status", "approved").gte("requestedAt", since))
    .take(200);
  for (const row of approved) {
    if (row.usedByRun || (row.kind !== "task" && row.kind !== "spend") || row.clientId !== input.clientId) continue;
    if ((row.credits ?? 0) < credits) continue;
    if (row.subjectTable === "agentTasks") {
      const taskId = ctx.db.normalizeId("agentTasks", row.subjectId);
      const task = taskId ? await ctx.db.get(taskId) : null;
      if (!task || task.workspaceId !== input.workspaceId || (task.work?.skillSlug && task.work.skillSlug !== input.skillSlug)) continue;
    }
    return row._id;
  }
  throw userError(spendWords(credits, limit!), "not_allowed");
}
