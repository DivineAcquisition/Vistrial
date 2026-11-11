/**
 * Acting inside a customer's own account, with approval. This is the approval surface only, running on a
 * dry-run driver: no browser is opened and no real account is touched (docs/rebuild/browser-with-approval.md).
 *
 * The shape is the one real access would have:
 *   - A session is per workspace and per site. The customer signs in themselves; Vistrial holds no password.
 *     Only an Owner can start one, and only an Owner can end it. It expires on its own.
 *   - A task is a goal on one session. Its steps are taken one at a time.
 *   - A step that only looks is done and logged. A step that changes something is shown first and waits for
 *     an Owner or Manager. A restricted step (payment, security, delete, message, publish) waits for an
 *     Owner, who types the word shown. Declining stops the task.
 *   - Every step is kept, in order, with who decided and a picture, as the audit trail.
 */

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { DRY_RUN_GOALS, drawStep, dryRunDriver } from "./lib/browserAgent/driver";
import { APPROVAL_HOURS, BLOCKED_WORDS, CONFIRM_WORD, MAX_STEPS_PER_TASK, RESTRICTED_REASONS, SESSION_DAYS, SITES, blocked, classify, redact, siteFor, type Blocked, type RestrictedReason } from "./lib/browserAgent/policy";
import { managerQuery, ownerMutation, workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const STOP_WORDS: Record<string, string> = {
  declined: "A step was declined, so the task stopped.",
  blocked: "A step was blocked by the rules, so the task stopped.",
  revoked: "The session was ended, so the task stopped.",
  expired: "The session expired, so the task stopped. Sign in again to continue.",
  approval_timed_out: `No one approved the waiting step within ${APPROVAL_HOURS} hours, so the task stopped.`,
  stopped: "The task was stopped.",
  limit: "The task reached its step limit.",
};

/** What a session is right now. Expiry is worked out when it is read, so a stale row never reads as active. */
export function sessionState(session: Pick<Doc<"browserSessions">, "status" | "expiresAt">, now = Date.now()): "pendingSignIn" | "active" | "expired" | "revoked" {
  if (session.status === "active" && session.expiresAt !== undefined && session.expiresAt <= now) return "expired";
  return session.status;
}

async function ownSession(ctx: QueryCtx, workspaceId: Id<"workspaces">, sessionId: Id<"browserSessions">) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.workspaceId !== workspaceId) notFound();
  return session;
}

async function ownTask(ctx: QueryCtx, workspaceId: Id<"workspaces">, browserTaskId: Id<"browserTasks">) {
  const task = await ctx.db.get(browserTaskId);
  if (!task || task.workspaceId !== workspaceId) notFound();
  return task;
}

function taskView(task: Doc<"browserTasks">) {
  return { id: task._id, sessionId: task.sessionId, goal: task.goal, status: task.status, stopReason: task.stopReason ?? null, stopWords: task.stopReason ? (STOP_WORDS[task.stopReason] ?? "The task stopped.") : null, steps: task.steps, createdAt: task.createdAt, finishedAt: task.finishedAt ?? null };
}

/**
 * The Browser access page: which sites use an API instead, which Vistrial will not automate, where a browser
 * could be used, the workspace's sessions and its recent tasks. Any member can read it.
 */
export const overview = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("browserSessions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(30);
    const tasks = await ctx.db
      .query("browserTasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(20);
    return {
      role: ctx.member.role,
      /** Only the practice site can be connected. Real account access is not built. */
      dryRunOnly: true,
      sites: SITES.map((site) => ({ key: site.key, name: site.name, mode: site.mode, note: site.note, reads: site.reads, changes: site.changes })),
      rules: {
        restricted: Object.entries(RESTRICTED_REASONS).map(([key, words]) => ({ key, words, confirm: CONFIRM_WORD[key as RestrictedReason] })),
        never: Object.values(BLOCKED_WORDS),
        sessionDays: SESSION_DAYS,
        approvalHours: APPROVAL_HOURS,
      },
      goals: DRY_RUN_GOALS.map((goal) => ({ key: goal.key, label: goal.label, summary: goal.summary })),
      sessions: sessions
        .filter((session) => session.status !== "revoked" || now - (session.revokedAt ?? 0) < 30 * DAY_MS)
        .map((session) => ({ id: session._id, site: session.site, siteName: siteFor(session.site)?.name ?? session.site, state: sessionState(session, now), createdAt: session.createdAt, signedInAt: session.signedInAt ?? null, expiresAt: session.expiresAt ?? null, lastUsedAt: session.lastUsedAt ?? null, revokedAt: session.revokedAt ?? null })),
      tasks: tasks.map(taskView),
    };
  },
});

/**
 * Starts a session for a site: the customer is about to sign in themselves. Owners only. Today only the
 * practice site can be connected; every real site says why not.
 */
export const connect = ownerMutation({
  args: { site: v.string() },
  handler: async (ctx, args) => {
    const site = siteFor(args.site);
    if (!site) notFound();
    if (site.mode === "api") throw userError(`${site.name} is reached through its official API, not a browser. ${site.note}`);
    if (site.mode === "never") throw userError(`Vistrial does not automate ${site.name}. ${site.note}`);
    if (site.mode !== "demo") throw userError(`Signing in to ${site.name} is not available yet. Only the practice site can be tried.`);
    const open = await ctx.db
      .query("browserSessions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(30);
    const live = open.find((row) => row.site === site.key && ["pendingSignIn", "active"].includes(sessionState(row)));
    if (live) return live._id;
    const sessionId = await ctx.db.insert("browserSessions", { workspaceId: ctx.workspaceId, site: site.key, driver: "dryRun", status: "pendingSignIn", createdBy: ctx.identity.subject, createdAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "browser.session.started", subject: sessionId });
    return sessionId;
  },
});

/**
 * The customer finished signing in, in the hosted browser view. In the dry run this is a button; with a real
 * driver it would be the vendor telling us the sign-in view closed on a signed-in page. Either way Vistrial
 * receives no password: only that the session is now signed in, and until when. Owners only.
 */
export const completeSignIn = ownerMutation({
  args: { sessionId: v.id("browserSessions") },
  handler: async (ctx, args) => {
    const session = await ownSession(ctx, ctx.workspaceId, args.sessionId);
    if (session.status !== "pendingSignIn") throw userError("This session is not waiting for a sign-in.");
    const now = Date.now();
    await ctx.db.patch(session._id, { status: "active", signedInAt: now, expiresAt: now + SESSION_DAYS * DAY_MS });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "browser.session.signedIn", subject: session._id });
    return null;
  },
});

async function stopTask(ctx: MutationCtx, task: Doc<"browserTasks">, stopReason: string) {
  if (task.status === "done" || task.status === "stopped") return;
  const steps = await stepsOf(ctx, task);
  for (const step of steps) if (step.status === "proposed") await ctx.db.patch(step._id, { status: stopReason === "approval_timed_out" ? "expired" : "declined", decidedAt: Date.now() });
  await ctx.db.patch(task._id, { status: "stopped", stopReason, finishedAt: Date.now() });
}

/** Ends a session now. Every task on it stops and nothing waiting can be approved afterwards. Owners only. */
export const revoke = ownerMutation({
  args: { sessionId: v.id("browserSessions") },
  handler: async (ctx, args) => {
    const session = await ownSession(ctx, ctx.workspaceId, args.sessionId);
    if (session.status === "revoked") return null;
    await ctx.db.patch(session._id, { status: "revoked", revokedAt: Date.now(), revokedBy: ctx.identity.subject });
    const tasks = await ctx.db
      .query("browserTasks")
      .withIndex("by_workspace_session", (q) => q.eq("workspaceId", ctx.workspaceId).eq("sessionId", session._id))
      .take(100);
    for (const task of tasks) await stopTask(ctx, task, "revoked");
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "browser.session.revoked", subject: session._id });
    return null;
  },
});

async function stepsOf(ctx: QueryCtx, task: Pick<Doc<"browserTasks">, "_id" | "workspaceId">) {
  return ctx.db
    .query("browserSteps")
    .withIndex("by_workspace_task", (q) => q.eq("workspaceId", task.workspaceId).eq("browserTaskId", task._id))
    .take(MAX_STEPS_PER_TASK + 1);
}

/**
 * Takes a task forward until it finishes, is blocked, or reaches a step that needs a person. Reads are done
 * and logged as they come. The first step that changes anything is written down as proposed and the task
 * waits: nothing is performed here that a person has not approved.
 */
async function advance(ctx: MutationCtx, browserTaskId: Id<"browserTasks">) {
  for (let guard = 0; guard < MAX_STEPS_PER_TASK; guard += 1) {
    const task = await ctx.db.get(browserTaskId);
    if (!task || task.status !== "running") return;
    const session = await ctx.db.get(task.sessionId);
    const state = session ? sessionState(session) : "revoked";
    if (!session || state !== "active") return stopTask(ctx, task, state === "expired" ? "expired" : "revoked");
    const site = siteFor(session.site);
    if (!site) return stopTask(ctx, task, "blocked");
    if (task.steps >= MAX_STEPS_PER_TASK) return stopTask(ctx, task, "limit");

    const proposed = dryRunDriver.next(task.goalKey, task.steps);
    if (!proposed) {
      await ctx.db.patch(task._id, { status: "done", finishedAt: Date.now() });
      return;
    }
    const now = Date.now();
    const stop: Blocked | null = blocked(proposed, site.hosts);
    const { kind, reason } = classify(proposed);
    const base = {
      workspaceId: task.workspaceId,
      browserTaskId: task._id,
      sessionId: session._id,
      index: task.steps,
      kind,
      ...(reason ? { restrictedReason: reason } : {}),
      verb: proposed.verb,
      target: proposed.target.slice(0, 200),
      url: proposed.url.slice(0, 500),
      ...(proposed.value !== undefined ? { value: redact(proposed.value) } : {}),
      why: proposed.why.slice(0, 400),
      createdAt: now,
    };
    await ctx.db.patch(task._id, { steps: task.steps + 1 });
    await ctx.db.patch(session._id, { lastUsedAt: now });
    if (stop) {
      await ctx.db.insert("browserSteps", { ...base, status: "blocked", blockedReason: stop });
      return stopTask(ctx, { ...task, steps: task.steps + 1 }, "blocked");
    }
    if (kind === "read") {
      const stepId = await ctx.db.insert("browserSteps", { ...base, status: "done", decidedAt: now });
      await ctx.scheduler.runAfter(0, internal.browserAccess.capture, { stepId });
      continue;
    }
    const stepId = await ctx.db.insert("browserSteps", { ...base, status: "proposed" });
    await ctx.db.patch(task._id, { status: "waitingApproval" });
    await ctx.scheduler.runAfter(0, internal.browserAccess.capture, { stepId });
    await ctx.scheduler.runAfter(APPROVAL_HOURS * HOUR_MS, internal.browserAccess.expireApproval, { stepId });
    return;
  }
}

/** Starts a practice task on a signed-in session. Owners and Managers. */
export const startTask = workspaceMutation({
  args: { sessionId: v.id("browserSessions"), goalKey: v.string() },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const session = await ownSession(ctx, ctx.workspaceId, args.sessionId);
    const state = sessionState(session);
    if (state === "expired") throw userError("This session expired. An Owner signs in again to continue.");
    if (state !== "active") throw userError("This session is not signed in.");
    const goal = DRY_RUN_GOALS.find((row) => row.key === args.goalKey);
    if (!goal) throw userError("Choose one of the practice tasks.");
    const browserTaskId = await ctx.db.insert("browserTasks", { workspaceId: ctx.workspaceId, sessionId: session._id, goalKey: goal.key, goal: goal.label, status: "running", steps: 0, createdBy: ctx.identity.subject, createdAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "browser.task.started", subject: browserTaskId });
    await advance(ctx, browserTaskId);
    return browserTaskId;
  },
});

/**
 * Approves or declines the one step a task is waiting on. A change: Owners and Managers. A restricted step:
 * Owners only, and approving needs the word shown for it, typed. Approval covers this step and no other.
 * Declining stops the task.
 */
export const decide = workspaceMutation({
  args: { stepId: v.id("browserSteps"), approve: v.boolean(), confirmWord: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const step = await ctx.db.get(args.stepId);
    if (!step || step.workspaceId !== ctx.workspaceId) notFound();
    const task = await ownTask(ctx, ctx.workspaceId, step.browserTaskId);
    if (step.status !== "proposed" || task.status !== "waitingApproval") throw userError("This step is no longer waiting for a decision.");
    const now = Date.now();
    if (!args.approve) {
      await ctx.db.patch(step._id, { status: "declined", decidedBy: ctx.identity.subject, decidedAt: now });
      await stopTask(ctx, task, "declined");
      await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "browser.step.declined", subject: step._id });
      return { status: "declined" as const };
    }
    if (step.kind === "restricted") {
      if (ctx.member.role !== "owner") throw userError("Only an Owner can approve this kind of step.", "not_allowed");
      const word = CONFIRM_WORD[(step.restrictedReason ?? "publish") as RestrictedReason];
      if ((args.confirmWord ?? "").trim() !== word) throw userError(`Type ${word} to approve this step.`);
    }
    const session = await ctx.db.get(step.sessionId);
    const state = session ? sessionState(session) : "revoked";
    if (state !== "active") {
      await stopTask(ctx, task, state === "expired" ? "expired" : "revoked");
      throw userError(state === "expired" ? "The session expired before this was approved. Nothing was done." : "The session was ended before this was approved. Nothing was done.");
    }
    // The dry-run driver performs nothing. A real driver would act here, once, and report what happened.
    await ctx.db.patch(step._id, { status: "done", decidedBy: ctx.identity.subject, decidedAt: now });
    await ctx.db.patch(task._id, { status: "running" });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: step.kind === "restricted" ? "browser.step.approvedRestricted" : "browser.step.approved", subject: step._id });
    await advance(ctx, task._id);
    return { status: "approved" as const };
  },
});

/** Stops a task. A step that was waiting is declined. Owners and Managers. */
export const stop = workspaceMutation({
  args: { browserTaskId: v.id("browserTasks") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const task = await ownTask(ctx, ctx.workspaceId, args.browserTaskId);
    await stopTask(ctx, task, "stopped");
    return null;
  },
});

/**
 * The audit trail of one task: every step in order, what it touched and where, what was typed, who decided
 * and when, and its picture. Owners and Managers: it can hold what was typed into a customer's account.
 */
export const trail = managerQuery({
  args: { browserTaskId: v.id("browserTasks") },
  handler: async (ctx, args) => {
    const task = await ownTask(ctx, ctx.workspaceId, args.browserTaskId);
    const steps = (await stepsOf(ctx, task)).sort((a, b) => a.index - b.index);
    const names = new Map<string, string>();
    for (const step of steps) {
      if (step.decidedBy && !names.has(step.decidedBy)) {
        const member = await ctx.db
          .query("members")
          .withIndex("by_workspace_user", (q) => q.eq("workspaceId", ctx.workspaceId).eq("userId", step.decidedBy!))
          .unique();
        names.set(step.decidedBy, member?.displayName ?? "A former member");
      }
    }
    const session = await ctx.db.get(task.sessionId);
    const rows = [];
    for (const step of steps) {
      const reason = step.restrictedReason as RestrictedReason | undefined;
      rows.push({
        id: step._id,
        index: step.index,
        kind: step.kind,
        restricted: reason ? { reason, words: RESTRICTED_REASONS[reason], confirm: CONFIRM_WORD[reason] } : null,
        verb: step.verb,
        target: step.target,
        url: step.url,
        value: step.value ?? null,
        why: step.why,
        status: step.status,
        blocked: step.blockedReason ? (BLOCKED_WORDS[step.blockedReason as Blocked] ?? "This step was blocked.") : null,
        decidedBy: step.decidedBy ? (names.get(step.decidedBy) ?? null) : null,
        decidedAt: step.decidedAt ?? null,
        at: step.createdAt,
        screenshot: step.screenshot ? await ctx.storage.getUrl(step.screenshot) : null,
        /** Whether this person may decide it: a restricted step is the Owner's alone. */
        canDecide: step.status === "proposed" && (step.kind !== "restricted" || ctx.member.role === "owner"),
      });
    }
    return { task: taskView(task), siteName: session ? (siteFor(session.site)?.name ?? session.site) : "", dryRun: true, steps: rows };
  },
});

/* ---- Internal ---- */

export const stepForCapture = internalQuery({
  args: { stepId: v.id("browserSteps") },
  handler: async (ctx, args) => {
    const step = await ctx.db.get(args.stepId);
    return step ? { verb: step.verb, target: step.target, url: step.url, value: step.value, kind: step.kind, index: step.index } : null;
  },
});

export const saveShot = internalMutation({
  args: { stepId: v.id("browserSteps"), screenshot: v.id("_storage") },
  handler: async (ctx, args) => {
    const step = await ctx.db.get(args.stepId);
    if (!step || step.screenshot) {
      await ctx.storage.delete(args.screenshot);
      return null;
    }
    await ctx.db.patch(step._id, { screenshot: args.screenshot });
    return null;
  },
});

/** Stores the step's picture. In the dry run it is a drawing that says so; a real driver would store a screenshot. */
export const capture = internalAction({
  args: { stepId: v.id("browserSteps") },
  handler: async (ctx, args): Promise<null> => {
    const step = await ctx.runQuery(internal.browserAccess.stepForCapture, { stepId: args.stepId });
    if (!step) return null;
    const screenshot = await ctx.storage.store(new Blob([drawStep(step, step.index)], { type: "image/svg+xml" }));
    await ctx.runMutation(internal.browserAccess.saveShot, { stepId: args.stepId, screenshot });
    return null;
  },
});

/** A step nobody decided in time is dropped and its task stops. Silence never approves anything. */
export const expireApproval = internalMutation({
  args: { stepId: v.id("browserSteps") },
  handler: async (ctx, args) => {
    const step = await ctx.db.get(args.stepId);
    if (!step || step.status !== "proposed") return null;
    const task = await ctx.db.get(step.browserTaskId);
    if (task) await stopTask(ctx, task, "approval_timed_out");
    return null;
  },
});
