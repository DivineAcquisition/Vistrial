/**
 * The Tasks board: work an agent proposes and a person approves. Every card carries what it is expected to
 * return (a range and its basis, or "Not enough data"), the most credits it may use, and the evidence
 * behind it. Agents do the work; Owners and Admins approve; a Member may propose and edit. Approving goes
 * through the one approvals door (convex/approvals.ts), which calls `approveTask` here.
 *
 * Not the `tasks` table, which is a sales follow-up list tied to leads.
 */
import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { startConversation } from "./agentChat";
import { GROWTH_ARCHITECT } from "./catalog";
import { changesBetween, planAssetItem, planOpportunity, CHECK_IN_DAYS } from "./decisions";
import { assertMove, cleanExpectedReturn, expectedReturnWords, rankTasks, refuseClaims, taskState } from "./lib/agentTasks";
import { APPROVAL_KIND_LABEL, needsApproval, spendLimit } from "./lib/approvals";
import { writeAudit } from "./lib/audit";
import { askApproval } from "./lib/briefing";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { loadCaps } from "./lib/capRows";
import { CHAT_ROUTES, ROUTE_CHOICES, isChatRoute, type ChatRoute } from "./lib/chatRouting";
import { agentWork } from "./lib/workWords";
import { clientForNew } from "./lib/clients";
import { priceFor } from "./lib/credits";
import { notAllowed, notFound, userError } from "./lib/errors";
import { canWork, isAdmin } from "./lib/roles";
import { linkedRecords, linksOf } from "./lib/taskLinks";
import { TASK_COLUMNS, expectedReturn, taskEvidence, type ExpectedReturn, type TaskColumn, type TaskEvidence } from "./lib/taskShapes";
import { SKILL_TAB } from "./lib/workTabs";
import { markOfRun } from "./lib/modelMarks";
import { markOf } from "./lib/models";

const MAX_TITLE = 140;
const MAX_WHY = 600;
const MAX_ASK = 1000;
const MAX_EVIDENCE = 8;
const BOARD_LIMIT = 300;

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

type Member = (QueryCtx | MutationCtx) & { workspaceId: Id<"workspaces"> };

async function ownTask(ctx: Member, taskId: Id<"agentTasks">) {
  const task = await ctx.db.get(taskId);
  if (!task || task.workspaceId !== ctx.workspaceId) notFound();
  return task;
}

/** The most credits one run of a skill can use here: its run cap, priced. This is the cost a card shows. */
export async function creditCostOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, agentSlug: string, skillSlug: string) {
  const caps = await loadCaps(ctx, workspaceId, agentSlug, skillSlug);
  return priceFor(caps.maxCostCentsPerRun);
}

/** Evidence as it may be stored: each record it points at is this organization's, and nothing claims a result. */
async function cleanEvidence(ctx: Member, items: TaskEvidence[]): Promise<TaskEvidence[]> {
  const out: TaskEvidence[] = [];
  for (const item of items.slice(0, MAX_EVIDENCE)) {
    const label = clip(item.label, 200);
    if (!label) continue;
    refuseClaims(label);
    if (item.kind === "figure") {
      out.push({ kind: "figure", label });
      continue;
    }
    const table = item.kind === "sourceRef" ? "sourceRefs" : item.kind === "asset" ? "assets" : "decisions";
    const id = item.refId ? ctx.db.normalizeId(table, item.refId) : null;
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.workspaceId !== ctx.workspaceId) notFound();
    out.push({ kind: item.kind, refId: row._id, label });
  }
  return out;
}

export type Proposal = {
  workspaceId: Id<"workspaces">;
  clientId?: Id<"clients">;
  title: string;
  why: string;
  proposedBy: Doc<"agentTasks">["proposedBy"];
  work?: { skillSlug?: string; ask: string };
  try?: Doc<"agentTasks">["try"];
  expectedReturn: ExpectedReturn;
  evidence: TaskEvidence[];
  planKey?: string;
};

/**
 * Writes a proposed task, asks for its approval and posts it to the Briefing. Shared by a person proposing
 * from the board and by the proposer skill, so both obey the same rules: no wording that claims a result,
 * an expected return that is a range with its basis or "Not enough data", and evidence that exists here.
 */
export async function insertProposal(ctx: MutationCtx & { workspaceId: Id<"workspaces"> }, input: Proposal): Promise<Id<"agentTasks">> {
  const title = clip(input.title, MAX_TITLE);
  const why = clip(input.why, MAX_WHY);
  if (title.length < 3) throw userError("Give the task a title.");
  refuseClaims(title, why, input.work?.ask);
  const expected = cleanExpectedReturn(input.expectedReturn);
  const evidence = await cleanEvidence(ctx, input.evidence);
  let work: Doc<"agentTasks">["work"];
  let creditCost = 0;
  if (input.work) {
    const ask = clip(input.work.ask, MAX_ASK);
    if (!ask) throw userError("Say what the agent should work on.");
    if (input.work.skillSlug !== undefined && !isChatRoute(input.work.skillSlug)) throw userError("That work cannot be started from a task yet.");
    work = { ask, ...(input.work.skillSlug ? { skillSlug: input.work.skillSlug } : {}) };
    // With no skill named the chat decides, so the card shows the most any of them can use.
    const skills = input.work.skillSlug ? [input.work.skillSlug] : [...CHAT_ROUTES];
    for (const skill of skills) creditCost = Math.max(creditCost, await creditCostOf(ctx, ctx.workspaceId, GROWTH_ARCHITECT, skill));
  }
  if (input.try && !CHECK_IN_DAYS.includes(input.try.checkInDays as (typeof CHECK_IN_DAYS)[number])) throw userError("Choose when to check back: 14, 30, 60 or 90 days.");
  const now = Date.now();
  const taskId = await ctx.db.insert("agentTasks", {
    workspaceId: ctx.workspaceId,
    ...(input.clientId ? { clientId: input.clientId } : {}),
    title,
    why,
    proposedBy: input.proposedBy,
    ...(work ? { agentSlug: GROWTH_ARCHITECT, work } : {}),
    ...(input.try ? { try: input.try } : {}),
    status: "proposed",
    expectedReturn: expected,
    creditCost,
    evidence,
    ...(input.planKey ? { planKey: input.planKey } : {}),
    createdAt: now,
    updatedAt: now,
  });
  const by = input.proposedBy;
  const byAgent = by.kind === "agent";
  const proposer = by.kind === "agent" ? by.agentSlug : by.userId;
  const limit = await spendLimit(ctx, ctx.workspaceId);
  const overLimit = needsApproval({ kind: "spend", credits: creditCost, limit });
  const approvalId = await askApproval(
    ctx,
    {
      workspaceId: ctx.workspaceId,
      clientId: input.clientId,
      kind: "task",
      subjectTable: "agentTasks",
      subjectId: taskId,
      summary: title,
      credits: creditCost,
      agentSlug: by.kind === "agent" ? by.agentSlug : undefined,
      requestedBy: byAgent ? "agent" : proposer,
    },
    { title: `${byAgent ? "Proposed" : "Proposed by a teammate"}: ${title}`, body: overLimit ? `${why} This is above your spending limit, so approving it also approves that spend.` : why },
  );
  await ctx.db.patch(taskId, { approvalId });
  await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: byAgent ? "system" : "user", actorId: proposer, action: "task.proposed", subject: taskId, count: creditCost });
  return taskId;
}

type Decider = MutationCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } };

/**
 * Approving a task, called by the approvals door once it has checked the person is an Owner or Admin.
 * A change the organization makes itself is recorded as a decision in the outcome loop, with its check-in
 * date and today's figures. Work for an agent starts the agent's conversation, which asks what it needs
 * and shows its plan and budget before anything runs.
 */
export async function approveTask(ctx: Decider, task: Doc<"agentTasks">) {
  assertMove(task.status, "approved");
  const patch: Partial<Doc<"agentTasks">> = { status: "approved", updatedAt: Date.now() };
  if (task.try) {
    patch.decisionId =
      task.try.kind === "opportunity" && task.try.projectId
        ? await planOpportunity(ctx, { projectId: task.try.projectId, opportunityIndex: task.try.index, checkInDays: task.try.checkInDays })
        : task.try.assetId
          ? await planAssetItem(ctx, { assetId: task.try.assetId, index: task.try.index, checkInDays: task.try.checkInDays })
          : notFound();
  }
  if (task.work) {
    const skill = task.work.skillSlug && isChatRoute(task.work.skillSlug) ? (task.work.skillSlug as ChatRoute) : undefined;
    const started = await startConversation(ctx, { text: task.work.ask, skill, forClient: task.clientId ? { clientId: task.clientId } : {} });
    patch.intakeId = started.intakeId;
    // The agent asks before it starts, so the task waits on a person until its plan is confirmed.
    patch.status = "needsYou";
  }
  await ctx.db.patch(task._id, patch);
  await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "task.approved", subject: task._id, count: task.creditCost });
}

/** Skipping a task: it leaves the board and can be proposed again later. */
export async function declineTask(ctx: Decider, task: Doc<"agentTasks">, reason?: string) {
  assertMove(task.status, "declined");
  const words = reason ? clip(reason, 300) : "";
  await ctx.db.patch(task._id, { status: "declined", ...(words ? { skippedReason: words } : {}), updatedAt: Date.now() });
  await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "task.skipped", subject: task._id });
}

async function evidenceView(ctx: Member, evidence: TaskEvidence[]) {
  const out: { kind: TaskEvidence["kind"]; label: string; href: string | null; external: boolean }[] = [];
  for (const item of evidence) {
    let href: string | null = null;
    let external = false;
    if (item.kind === "sourceRef" && item.refId) {
      const id = ctx.db.normalizeId("sourceRefs", item.refId);
      const ref = id ? await ctx.db.get(id) : null;
      if (ref && ref.workspaceId === ctx.workspaceId) {
        href = ref.url;
        external = true;
      }
    } else if (item.kind === "asset" && item.refId) {
      const id = ctx.db.normalizeId("assets", item.refId);
      const asset = id ? await ctx.db.get(id) : null;
      if (asset && asset.workspaceId === ctx.workspaceId) href = `/app/assets/${asset._id}`;
    } else if (item.kind === "decision" && item.refId) {
      const id = ctx.db.normalizeId("decisions", item.refId);
      const decision = id ? await ctx.db.get(id) : null;
      if (decision && decision.workspaceId === ctx.workspaceId) href = decision.assetId ? `/app/assets/${decision.assetId}` : `/app/agents/${GROWTH_ARCHITECT}/sessions/${decision.projectId}`;
    }
    out.push({ kind: item.kind, label: item.label, href, external });
  }
  return out;
}

/** Where a card's work can be opened: its draft, its run, or the conversation the agent is asking in. */
function workHref(task: Doc<"agentTasks">, records: Awaited<ReturnType<typeof linkedRecords>>): { href: string; label: string } | null {
  const agent = task.agentSlug ?? GROWTH_ARCHITECT;
  if (records.asset) return { href: `/app/assets/${records.asset._id}`, label: records.asset.status === "draft" || records.asset.status === "needsReview" ? "Review the draft" : "Open the result" };
  if (records.run) return { href: `/app/runs/${records.run._id}`, label: records.run.status === "waiting" || records.run.status === "needsInput" ? "Answer the question" : "Open the run" };
  if (records.intake) return { href: `/app/agents/${agent}/work/chat?c=${records.intake._id}`, label: records.intake.status === "ready" ? "See the plan and start" : "Open the conversation" };
  if (records.decision) {
    const tab = records.decision.assetId ? `/app/assets/${records.decision.assetId}` : `/app/agents/${agent}/sessions/${records.decision.projectId}`;
    return { href: tab, label: records.decision.outcome ? "Open the result" : "Open the report it came from" };
  }
  return null;
}

async function card(ctx: Member & { role: string }, task: Doc<"agentTasks">, now: number, clientNames: Map<string, string>) {
  const records = await linkedRecords(ctx, task);
  const state = taskState(task.status, linksOf(records), now);
  const words = expectedReturnWords(task.expectedReturn);
  const approval = task.approvalId ? await ctx.db.get(task.approvalId) : null;
  const outcome = records.decision?.outcome;
  let client: string | null = null;
  if (task.clientId) {
    if (!clientNames.has(task.clientId)) clientNames.set(task.clientId, (await ctx.db.get(task.clientId))?.name ?? "A client");
    client = clientNames.get(task.clientId)!;
  }
  return {
    id: task._id,
    column: state.column,
    note: state.note,
    title: task.title,
    why: task.why,
    client,
    clientId: task.clientId ?? null,
    by: task.proposedBy.kind === "agent" ? ("agent" as const) : ("person" as const),
    agentSlug: task.agentSlug ?? (task.proposedBy.kind === "agent" ? task.proposedBy.agentSlug : null),
    /** "work": an agent does it. "change": the organization makes the change itself and checks back. */
    type: task.work ? ("work" as const) : ("change" as const),
    ask: task.work?.ask ?? null,
    /** The agent and its work, "Strategist · Research": a skill is never named in the app. */
    skill: task.work?.skillSlug ? agentWork(task.agentSlug ?? null, task.work.skillSlug) : null,
    skillSlug: task.work?.skillSlug ?? null,
    workTab: task.work?.skillSlug && isChatRoute(task.work.skillSlug) ? SKILL_TAB[task.work.skillSlug] : null,
    checkInDays: task.try?.checkInDays ?? null,
    expectedReturn: { text: words.text, basis: words.basis, known: task.expectedReturn.basis !== "insufficient" },
    creditCost: task.creditCost,
    evidence: await evidenceView(ctx, task.evidence),
    approvalId: approval?.status === "waiting" ? approval._id : null,
    link: workHref(task, records),
    checkInAt: records.decision?.checkInAt ?? null,
    decisionId: records.decision && !outcome && records.decision.checkInAt <= now ? records.decision._id : null,
    /** What was measured at the check-in. Only ever from a recorded outcome. */
    result: outcome ? { result: outcome.result, note: outcome.note, recordedAt: outcome.recordedAt, changes: changesBetween(records.decision!.baseline, outcome.after) } : null,
    skippedReason: task.skippedReason ?? null,
    /** The model of the run that did this task's work, else of the run that proposed it. Null when neither is known. */
    model: markOf(records.run?.madeWith) ?? (task.proposedBy.kind === "agent" ? await markOfRun(ctx, task.workspaceId, task.proposedBy.runId) : null),
    createdAt: task.createdAt,
  };
}

/**
 * The board: six columns, each ranked by expected return. A Member or Viewer sees only the clients they are
 * assigned to; the client picker narrows it further. Skipped tasks are listed apart.
 */
export const board = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("agentTasks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(BOARD_LIMIT);
    const names = new Map<string, string>();
    const columns = Object.fromEntries(TASK_COLUMNS.map((column) => [column, [] as (Doc<"agentTasks"> & { view: Awaited<ReturnType<typeof card>> })[]])) as Record<TaskColumn, (Doc<"agentTasks"> & { view: Awaited<ReturnType<typeof card>> })[]>;
    const skipped: Awaited<ReturnType<typeof card>>[] = [];
    for (const task of rows) {
      const view = await card(ctx, task, now, names);
      if (view.column) columns[view.column].push({ ...task, view });
      else if (skipped.length < 20) skipped.push(view);
    }
    return {
      columns: TASK_COLUMNS.map((column) => ({ column, cards: rankTasks(columns[column]).map((row) => row.view) })),
      skipped,
      spendLimit: await spendLimit(ctx, ctx.workspaceId),
      /** Owners and Admins approve and skip. */
      canApprove: isAdmin(ctx.role),
      /** Everyone except a Viewer may propose, edit and start. */
      canWork: canWork(ctx.role),
      skills: ROUTE_CHOICES.map((row) => ({ slug: row.skill, name: row.name, does: row.does })),
      approvalWords: APPROVAL_KIND_LABEL.task,
    };
  },
});

/** A person proposes work for an agent. It waits for an Owner or Admin like any other. Owners, Admins and Members. */
export const propose = workspaceMutation({
  args: {
    title: v.string(),
    why: v.string(),
    ask: v.string(),
    skillSlug: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    expectedReturn: v.optional(expectedReturn),
    evidence: v.optional(v.array(taskEvidence)),
  },
  handler: async (ctx, args) => {
    const forClient = await clientForNew(ctx, args.clientId);
    return insertProposal(ctx, {
      workspaceId: ctx.workspaceId,
      ...forClient,
      title: args.title,
      why: args.why,
      proposedBy: { kind: "person", userId: ctx.identity.subject },
      work: { ask: args.ask, skillSlug: args.skillSlug },
      expectedReturn: args.expectedReturn ?? { basis: "insufficient" },
      evidence: args.evidence ?? [],
    });
  },
});

/** Changes a proposed task's words before it is decided. Owners, Admins and Members. Once approved it is fixed. */
export const edit = workspaceMutation({
  args: { agentTaskId: v.id("agentTasks"), title: v.optional(v.string()), why: v.optional(v.string()), ask: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const task = await ownTask(ctx, args.agentTaskId);
    if (task.status !== "proposed") throw userError("Only a proposed task can be edited.");
    const title = args.title !== undefined ? clip(args.title, MAX_TITLE) : task.title;
    const why = args.why !== undefined ? clip(args.why, MAX_WHY) : task.why;
    const ask = args.ask !== undefined ? clip(args.ask, MAX_ASK) : task.work?.ask;
    if (title.length < 3) throw userError("Give the task a title.");
    if (task.work && !ask) throw userError("Say what the agent should work on.");
    refuseClaims(title, why, ask);
    await ctx.db.patch(task._id, { title, why, ...(task.work && ask ? { work: { ...task.work, ask } } : {}), updatedAt: Date.now() });
    // The approval and its Briefing post read the title as it is now.
    if (task.approvalId) await ctx.db.patch(task.approvalId, { summary: title });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "task.edited", subject: task._id });
    return null;
  },
});

/** Puts a skipped task back in Proposed, where it waits for a decision again. Owners, Admins and Members. */
export const reopen = workspaceMutation({
  args: { agentTaskId: v.id("agentTasks") },
  handler: async (ctx, args) => {
    const task = await ownTask(ctx, args.agentTaskId);
    if (task.status !== "declined") notAllowed();
    assertMove(task.status, "proposed");
    const approvalId = await askApproval(
      ctx,
      { workspaceId: ctx.workspaceId, clientId: task.clientId, kind: "task", subjectTable: "agentTasks", subjectId: task._id, summary: task.title, credits: task.creditCost, agentSlug: task.agentSlug, requestedBy: ctx.identity.subject },
      { title: `Proposed again: ${task.title}`, body: task.why },
    );
    await ctx.db.patch(task._id, { status: "proposed", approvalId, skippedReason: undefined, updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "task.reopened", subject: task._id });
    return null;
  },
});

/** Marks an approved task finished when nothing an agent made says so for it. Owners, Admins and Members. */
export const markDone = workspaceMutation({
  args: { agentTaskId: v.id("agentTasks") },
  handler: async (ctx, args) => {
    const task = await ownTask(ctx, args.agentTaskId);
    const state = taskState(task.status, linksOf(await linkedRecords(ctx, task)), Date.now());
    if (state.column !== "approved" && state.column !== "needsYou") throw userError("This task cannot be marked done from where it is.");
    assertMove(state.status, "done");
    await ctx.db.patch(task._id, { status: "done", updatedAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "task.done", subject: task._id });
    return null;
  },
});
