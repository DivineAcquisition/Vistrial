import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { insertProposal } from "../../agentTasks";
import { GROWTH_ARCHITECT } from "../../catalog";
import { currentFigures, describeDecision, itemOf } from "../../decisions";
import { currentGoal } from "../../goals";
import { expectedReturnWords } from "../../lib/agentTasks";
import { post } from "../../lib/briefing";
import { creditWords, priceFor } from "../../lib/credits";
import { reportForProject } from "../../studio";
import type { ToolOutcome } from "../marketIntelligence/tools";
import { latestDone, recordOf } from "../marketIntelligence/records";
import type { SkillContext } from "../types";
import { MAX_CANDIDATES, MAX_SOURCES_PER_CANDIDATE, PHASE, readChoice, settlePicks, settleSummary, type Candidate, type PlanFigure, type PlanRecord, type PlanSource } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);
const day = (time: number) => new Date(time).toISOString().slice(0, 10);

export async function planOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "plan")) as PlanRecord | null) : null;
}

/** Items already on the board, in any state: nothing is proposed twice, and a skipped task is not proposed again. */
async function alreadyProposed(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  const tasks = await ctx.db.query("agentTasks").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(400);
  const keys = new Set<string>();
  for (const task of tasks) {
    if (task.try) keys.add(task.try.kind === "opportunity" ? `o:${task.try.projectId}:${task.try.index}` : `a:${task.try.assetId}:${task.try.index}`);
    if (task.planKey) keys.add(`p:${task.planKey}`);
  }
  return keys;
}

/**
 * Read: everything the plan is chosen from, in code. Candidates are items of the organization's own
 * approved reports that nobody has decided on yet: a research report's opportunities, an offer analysis's
 * changes, a diagnosis's roadmap steps, a page teardown's suggestions. Plus its own figures, what it tried
 * before, its goal, and what finished and came due this week for the report.
 */
const read: MutationTool = async (ctx, run) => {
  const workspaceId = run.workspaceId;
  const now = Date.now();
  const taken = await alreadyProposed(ctx, workspaceId);
  const names = new Map<string, string>();
  const nameOf = async (clientId: Id<"clients"> | undefined) => {
    if (!clientId) return null;
    if (!names.has(clientId)) names.set(clientId, (await ctx.db.get(clientId))?.name ?? "A client");
    return names.get(clientId)!;
  };
  const candidates: Candidate[] = [];
  const add = async (row: Omit<Candidate, "id" | "scope" | "clientId" | "clientName">, clientId: Id<"clients"> | undefined) => {
    if (candidates.length >= MAX_CANDIDATES) return;
    candidates.push({ ...row, id: `c${candidates.length + 1}`, scope: clientId ?? "own", clientId: clientId ?? null, clientName: await nameOf(clientId) });
  };

  // Market sources a report cited for one of its items. Each must be this organization's and belong to the
  // report's own project, so a source can only ever support an item of the same organization or client.
  const sources: PlanSource[] = [];
  const sourcesFor = async (project: Doc<"researchProjects">, ids: string[]) => {
    const out: string[] = [];
    for (const raw of ids) {
      if (out.length >= MAX_SOURCES_PER_CANDIDATE) break;
      const id = ctx.db.normalizeId("sourceRefs", raw);
      const ref = id ? await ctx.db.get(id) : null;
      if (!ref || ref.workspaceId !== workspaceId || ref.projectId !== project._id) continue;
      let known = sources.find((row) => row.refId === ref._id);
      if (!known) {
        known = { id: `s${sources.length + 1}`, refId: ref._id, scope: project.clientId ?? "own", title: clip(ref.title, 160), publisher: ref.publisher ? clip(ref.publisher, 80) : null, date: `${ref.publishedAt ? "published" : "read"} ${day(ref.publishedAt ?? ref.observedAt)}`, excerpt: ref.excerpt ? clip(ref.excerpt, 300) : null, limitation: ref.limitation ? clip(ref.limitation, 160) : null };
        sources.push(known);
      }
      out.push(known.id);
    }
    return out;
  };

  const decisions = await ctx.db.query("decisions").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).take(300);

  // Opportunities of approved research reports.
  const projects = await ctx.db.query("researchProjects").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)).order("desc").take(15);
  for (const project of projects) {
    if (project.status === "archived") continue;
    const written = await reportForProject(ctx, project);
    const assetId = written?.assetId ? ctx.db.normalizeId("assets", written.assetId) : null;
    const asset = assetId ? await ctx.db.get(assetId) : null;
    if (!written || !asset || asset.workspaceId !== workspaceId || asset.status !== "approved") continue;
    for (const [index, opportunity] of written.report.opportunities.entries()) {
      if (taken.has(`o:${project._id}:${index}`) || decisions.some((row) => row.projectId === project._id && row.runId === written.runId && !row.itemKind && row.opportunityIndex === index)) continue;
      await add({ kind: "opportunity", title: clip(opportunity.opportunity, 140), action: clip(opportunity.proposedAction, 300), howToTell: clip(opportunity.validationMethod, 200), assetId: asset._id, assetTitle: asset.title, projectId: project._id, index, sourceIds: await sourcesFor(project, opportunity.evidence.sourceRefIds), uncertainty: opportunity.evidence.uncertainty }, project.clientId);
    }
  }

  // Items of approved offer analyses, growth diagnoses and page teardowns.
  for (const kind of ["offerAnalysis", "growthDiagnosis", "pageTeardown"] as const) {
    const assets = await ctx.db.query("assets").withIndex("by_workspace_kind_status", (q) => q.eq("workspaceId", workspaceId).eq("kind", kind).eq("status", "approved")).order("desc").take(5);
    for (const asset of assets) {
      for (let index = 0; index < 8; index += 1) {
        const item = await itemOf(ctx, asset, index);
        if (!item) break;
        if (taken.has(`a:${asset._id}:${index}`) || decisions.some((row) => row.assetId === asset._id && row.itemKind === item.itemKind && row.opportunityIndex === index)) continue;
        const project = await ctx.db.get(item.projectId);
        await add({ kind: "assetItem", title: clip(item.opportunity, 140), action: clip(item.proposedAction, 300), howToTell: clip(item.validationMethod, 200), assetId: asset._id, assetTitle: asset.title, projectId: item.projectId, index }, project?.clientId);
      }
    }
  }

  // The organization's own figures, per organization or client, and what it tried before.
  const figures: PlanFigure[] = [];
  const scopes: (Id<"clients"> | undefined)[] = [undefined, ...(await ctx.db.query("clients").withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId).eq("status", "active")).take(40)).map((row) => row._id)];
  for (const clientId of scopes) {
    for (const row of await currentFigures(ctx, workspaceId, clientId)) {
      const where = (await nameOf(clientId)) ?? "your organization";
      for (const metric of ["conversions", "spend", "revenue"] as const) {
        const value = row[metric];
        if (value === undefined) continue;
        const display = metric === "conversions" ? `${value.toLocaleString("en-US")} results` : `${value.toLocaleString("en-US")} ${row.currency}`;
        figures.push({ id: `f${figures.length + 1}`, scope: clientId ?? "own", label: `${row.label} ${metric === "conversions" ? "results" : metric} (${where}${row.dateStart && row.dateStop ? `, ${row.dateStart} to ${row.dateStop}` : ""})`, metric, value, display });
      }
    }
  }
  const outcomes = decisions.filter((row) => row.outcome).sort((a, b) => b.outcome!.recordedAt - a.outcome!.recordedAt).slice(0, 8).map((row) => describeDecision(row));
  const goal = await currentGoal(ctx, workspaceId);

  // For the weekly report: what finished and what came due in the last seven days.
  const posts = await ctx.db.query("briefingItems").withIndex("by_workspace_at", (q) => q.eq("workspaceId", workspaceId).gt("at", now - WEEK_MS)).take(100);
  const finished = posts.filter((row) => row.kind === "finished").map((row) => row.title.replace(/^Finished: /, "")).slice(0, 10);
  const due = decisions.filter((row) => !row.outcome && row.checkInAt <= now).map((row) => row.proposedAction).slice(0, 10);

  // The owner's goal as a number a month, when their words name one in a measure: the ceiling of an inference.
  const PER_MONTH = { week: 52 / 12, month: 1, quarter: 1 / 3, year: 1 / 12 } as const;
  const monthlyTarget = goal?.metric && goal.target && goal.target > 0 ? Math.round(goal.target * PER_MONTH[goal.period ?? "month"] * 10) / 10 : null;
  const value: PlanRecord = { planKey: run.inputRef, weekly: run.inputRef.startsWith("week:"), candidates, figures, outcomes, goal: goal?.text ?? null, metric: clip(goal?.metric ?? "results", 40) || "results", sources, monthlyTarget, finished, due };
  return { resultCode: candidates.length ? "ok" : "nothing_to_propose", resultId: String(candidates.length), artifact: record("plan", value) };
};

/**
 * Save: each settled pick becomes a proposed task waiting for an Owner or Admin, and a weekly run posts
 * the growth report to the Briefing with what the run used. The report's facts are written in code from
 * the organization's own records; only its opening sentences come from the model, and only if they claim nothing.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const plan = await planOf(ctx.db, run, steps);
  if (!plan) return { failCode: "no_plan" };
  const chooseStep = latestDone(steps, PHASE.choose);
  const choice = chooseStep ? readChoice(await recordOf(ctx.db, run, chooseStep._id, "model")) : null;
  const settled = settlePicks(plan, choice);
  const proposed: { taskId: Id<"agentTasks">; title: string; client: string | null; expected: string }[] = [];
  for (const task of settled) {
    const { candidate } = task;
    const taskId = await insertProposal(
      { ...ctx, workspaceId: run.workspaceId },
      {
        workspaceId: run.workspaceId,
        ...(candidate.clientId ? { clientId: candidate.clientId as Id<"clients"> } : {}),
        title: candidate.action || candidate.title,
        why: task.why,
        proposedBy: { kind: "agent", agentSlug: GROWTH_ARCHITECT, runId: run._id },
        try:
          candidate.kind === "opportunity"
            ? { kind: "opportunity", projectId: candidate.projectId as Id<"researchProjects">, index: candidate.index, checkInDays: 30 }
            : { kind: "assetItem", assetId: candidate.assetId as Id<"assets">, index: candidate.index, checkInDays: 30 },
        expectedReturn: task.expectedReturn,
        evidence: task.evidence,
        planKey: `${plan.planKey}:${candidate.id}`,
      },
    );
    const words = expectedReturnWords(task.expectedReturn);
    proposed.push({ taskId, title: candidate.action || candidate.title, client: candidate.clientName, expected: words.text === words.basis ? words.text : `${words.text} (${words.basis})` });
  }

  if (plan.weekly) {
    const used = priceFor(run.costCents);
    const summary = settleSummary(choice);
    const list = (title: string, rows: string[], none: string) => [title, ...(rows.length ? rows.map((row) => `• ${row}`) : [none])].join("\n");
    const body = [
      ...(summary ? [summary] : []),
      list("What finished", plan.finished, "Nothing finished this week."),
      list("What was measured", plan.outcomes.slice(0, 5), "No result has been recorded yet."),
      list("Your figures now", plan.figures.filter((row) => row.metric === "conversions").slice(0, 8).map((row) => `${row.label}: ${row.display}`), "No results are connected, so nothing here is measured. Connect a calendar or Meta ads, or upload a results file."),
      list("Check-ins due", plan.due, "None."),
      list("Proposed for next week", proposed.map((row) => `${row.title}${row.client ? ` (${row.client})` : ""}. Expected: ${row.expected}`), plan.candidates.length ? "Nothing was chosen from the open items." : "Nothing new to propose: every item of your approved reports has been decided on."),
      `These are on the Tasks board, waiting for an Owner or Admin. Writing this plan used ${creditWords(used)}.`,
    ].join("\n\n");
    await post(ctx, { workspaceId: run.workspaceId, kind: "weeklyReport", agentSlug: GROWTH_ARCHITECT, title: `Weekly growth report: week of ${day(Date.now())}`, body, ref: { table: "agentTasks", id: "board" }, credits: used, key: `weekly:${plan.planKey}` });
  }
  return { resultCode: proposed.length ? "ok" : "nothing_proposed", resultId: String(proposed.length), artifact: record("proposed", { proposed, notes: settled.flatMap((row) => row.notes) }) };
};

/** Code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const PROPOSER_TOOLS: Record<string, MutationTool> = { "tp.read": read, "tp.save": save };
