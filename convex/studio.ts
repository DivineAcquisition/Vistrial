import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { workspaceQuery } from "./lib/builders";
import { SKILL_CAPS, dayKey } from "./lib/caps";
import { daySpend, loadCaps } from "./lib/capRows";
import { TYPICAL_RESEARCH_COST_CENTS } from "./lib/credits";
import { notFound } from "./lib/errors";
import { euUkCountry } from "./adapters/metaAdLibrary";
import { PHASE, SKILL_SLUG, parseJson, readBrief, readReport, type ChecksRecord, type ContextRecord } from "./skills/marketIntelligence/shapes";

const AGENT = "growth-architect";

/** What a source can do in this deployment. Settings are read for presence only; no value ever leaves. */
export const sourceSetup = workspaceQuery({
  args: { geography: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const has = (name: string) => Boolean(process.env[name]);
    const inEuUk = args.geography ? euUkCountry(args.geography) !== null : false;
    const caps = await loadCaps(ctx, ctx.workspaceId, AGENT, SKILL_SLUG);
    return {
      sources: [
        { platform: "web", state: "ready", words: "Web search and the pages it finds." },
        has("YOUTUBE_API_KEY")
          ? { platform: "youtube", state: "ready", words: "YouTube search, shown with YouTube's own player." }
          : { platform: "youtube", state: "limited", words: "YouTube search is not set up. Videos found on the web or pasted in still show." },
        { platform: "tiktok", state: "limited", words: "TikTok has no public search. Videos found on the web or pasted in are checked and shown." },
        has("META_APP_ID") && has("META_APP_SECRET")
          ? { platform: "instagram", state: "limited", words: "Instagram posts show as links until Meta approves previews." }
          : { platform: "instagram", state: "limited", words: "Instagram posts show as links. Previews need the Meta app connected." },
        !inEuUk
          ? { platform: "metaAdLibrary", state: "limited", words: "Meta's Ad Library has no API for ads outside the EU and UK. Pasted ad links show as cards." }
          : has("META_AD_LIBRARY_TOKEN")
            ? { platform: "metaAdLibrary", state: "ready", words: "Meta's official Ad Library search for this country." }
            : { platform: "metaAdLibrary", state: "limited", words: "The Ad Library connection is not set up. Pasted ad links show as cards." },
      ] as { platform: string; state: "ready" | "limited"; words: string }[],
      cost: {
        capCents: caps.maxCostCentsPerRun,
        reserveCents: 50,
        dayCapCents: caps.maxCostCentsPerDay,
        daySpentCents: await daySpend(ctx, ctx.workspaceId, AGENT, SKILL_SLUG, dayKey()),
        // Measured on dev (phase-2-progress, 2.11): 82¢ for 60 sources with one revision.
        typicalCents: TYPICAL_RESEARCH_COST_CENTS,
        defaultCapCents: SKILL_CAPS[SKILL_SLUG].maxCostCentsPerRun,
      },
    };
  },
});

/**
 * Runs that need a person: waiting on an answer, or timed out waiting. Each comes with its research project
 * so the Decisions queue can link straight to the question.
 */
export const attention = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = [];
    for (const status of ["waiting", "needsInput"] as const) {
      rows.push(
        ...(await ctx.db
          .query("agentRuns")
          .withIndex("by_workspace_status", (q) => q.eq("workspaceId", ctx.workspaceId).eq("status", status))
          .take(25)),
      );
    }
    const out = [];
    for (const run of rows) {
      const projectId = ctx.db.normalizeId("researchProjects", run.inputRef);
      const project = projectId ? await ctx.db.get(projectId) : null;
      if (!run.waitingFor || !project || project.workspaceId !== ctx.workspaceId) continue;
      out.push({
        runId: run._id,
        status: run.status,
        question: run.waitingFor.question,
        askedAt: run.waitingFor.askedAt,
        projectId: project._id,
        projectTitle: project.title,
      });
    }
    return out.sort((a, b) => b.askedAt - a.askedAt);
  },
});

async function stepsOf(ctx: QueryCtx, run: Doc<"agentRuns">) {
  const rows = await ctx.db
    .query("runSteps")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(250);
  return rows.sort((a, b) => a.index - b.index);
}

async function recordFor(ctx: QueryCtx, run: Doc<"agentRuns">, stepId: Id<"runSteps"> | undefined, kind: string) {
  if (!stepId) return null;
  const rows = await ctx.db
    .query("runArtifacts")
    .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("runId", run._id))
    .take(300);
  return parseJson(rows.find((row) => row.stepId === stepId && row.kind === kind)?.body);
}

function lastOf(steps: Doc<"runSteps">[], phase: string) {
  return [...steps].reverse().find((step) => step.phase === phase && step.status === "completed" && step.kind !== "note");
}

/**
 * Everything the Research Studio shows for one project: the scope, the latest run and what it is waiting
 * for, the context it used (with origin and date), the brief, the checks, and the opportunities. Built on
 * the server from the run's own records, so screens never read raw model or page text.
 */
/** The latest report written for a project, read from its run's own records. Null before one is written. */
export async function reportForProject(ctx: QueryCtx, project: Doc<"researchProjects">) {
  const run = project.latestRunId ? await ctx.db.get(project.latestRunId) : null;
  if (!run || run.workspaceId !== project.workspaceId) return null;
  return reportForRun(ctx, run);
}

/** The report one run wrote, read from its own records. Null before it is written. */
export async function reportForRun(ctx: QueryCtx, run: Doc<"agentRuns">) {
  const steps = await stepsOf(ctx, run);
  const reportStep = lastOf(steps, PHASE.revise) ?? lastOf(steps, PHASE.write);
  const report = readReport(await recordFor(ctx, run, reportStep?._id, "model"));
  const saveStep = lastOf(steps, PHASE.save);
  return report ? { report, runId: run._id, assetId: (saveStep?.resultId as Id<"assets"> | undefined) ?? null } : null;
}

export const studio = workspaceQuery({
  args: { projectId: v.id("researchProjects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.workspaceId !== ctx.workspaceId) notFound();
    const run = project.latestRunId ? await ctx.db.get(project.latestRunId) : null;
    const projectView = {
      id: project._id,
      title: project.title,
      objective: project.objective,
      market: project.market,
      geography: project.geography,
      competitors: project.competitors,
      platforms: project.platforms,
      suppliedUrls: project.suppliedUrls,
      status: project.status,
      createdAt: project.createdAt,
    };
    if (!run || run.workspaceId !== ctx.workspaceId) return { project: projectView, run: null, context: null, brief: null, checks: null, report: null, assetId: null };

    const steps = await stepsOf(ctx, run);
    const contextStep = lastOf(steps, PHASE.context);
    const context = (await recordFor(ctx, run, contextStep?._id, "context")) as ContextRecord | null;
    const brief = readBrief(await recordFor(ctx, run, lastOf(steps, PHASE.brief)?._id, "model"));
    const checkStep = lastOf(steps, PHASE.recheck) ?? lastOf(steps, PHASE.check);
    const checks = (await recordFor(ctx, run, checkStep?._id, "checks")) as ChecksRecord | null;
    const reportStep = lastOf(steps, PHASE.revise) ?? lastOf(steps, PHASE.write);
    const report = readReport(await recordFor(ctx, run, reportStep?._id, "model"));
    const saveStep = lastOf(steps, PHASE.save);
    const reserveSkipped = steps.some((step) => step.kind === "note" && step.resultCode === "over_budget");

    return {
      project: projectView,
      run: {
        id: run._id,
        skillSlug: run.skillSlug,
        status: run.status,
        stopReason: run.stopReason ?? null,
        costCents: run.costCents,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        // Only the question a person may answer, with its id so a stale answer is refused.
        waitingFor: run.waitingFor ? { questionId: run.waitingFor.questionId, question: run.waitingFor.question, askedAt: run.waitingFor.askedAt } : null,
        needsInputReason: run.needsInputReason ?? null,
        stepsDone: steps.length,
        reserveSkipped,
      },
      context: context
        ? {
            market: context.market,
            geography: context.geography,
            profile: context.profile ? { versionId: context.profile.versionId, offer: context.profile.offer, audience: context.profile.audience, geography: context.profile.geography } : null,
            facts: context.facts.map((row) => ({ id: row.id, factKey: row.factKey, value: row.value, status: row.status, sourceType: row.sourceType, recordedAt: row.recordedAt })),
            gaps: context.gaps,
            known: context.known ?? [],
            missing: context.missing ?? [],
            assumptions: context.assumptions ?? [],
          }
        : null,
      brief,
      checks,
      report,
      assetId: saveStep?.resultId ?? null,
    };
  },
});
