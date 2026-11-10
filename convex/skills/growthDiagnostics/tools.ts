import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { factsForRun } from "../../lib/facts";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import { runChecks } from "./checks";
import { computeDiagnostics } from "./compute";
import { renderDiagnosis, renderNotEnough } from "./render";
import { gatherFirstParty } from "./sources";
import { currentGoal } from "../../goals";
import { PHASE, STAGE_WORDS, readDiagnosis, type ChecksRecord, type Diagnosis, type DiagnosticsRecord, type Figure } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

/** What the read step saw and computed, from its saved record. */
export async function diagnosticsOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "diagnostics")) as DiagnosticsRecord | null) : null;
}

async function diagnosisAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<Diagnosis | null> {
  return step ? readDiagnosis(await recordOf(ctx.db, run, step._id, "model")) : null;
}

/**
 * Observe and compute: saves the business's own results as "Your data" sources on the diagnosis project,
 * then works out every figure in code. Reads the confirmed profile and business facts for context.
 */
const read: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  if (!project) return { failCode: "no_project" };
  const profile = await ctx.db
    .query("profileVersions")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", run.workspaceId).eq("status", "confirmed"))
    .order("desc")
    .first();
  const facts = await factsForRun(ctx, run.workspaceId);
  const computed = computeDiagnostics(await gatherFirstParty(ctx, run, project));
  const goal = await currentGoal(ctx, run.workspaceId);
  const value: DiagnosticsRecord = {
    projectId: project._id,
    ...computed,
    profile: profile
      ? { versionId: profile._id, offer: profile.offer, priceNotes: profile.priceNotes, audience: profile.audience, geography: profile.geography, channels: profile.channels }
      : null,
    facts: facts.slice(0, 40).map((row) => ({ id: row._id, factKey: row.factKey, value: row.value, status: row.status })),
    goal: goal ? { text: goal.text, target: goal.target ?? null, metric: goal.metric ?? null, period: goal.period ?? null } : null,
  };
  return { resultCode: computed.hasData ? "ok" : "no_data", resultId: String(computed.figures.length), artifact: record("diagnostics", value) };
};

/** Validate: the completion checks, in code, on the latest draft. */
const check: MutationTool = async (ctx, run, steps) => {
  const diagnostics = await diagnosticsOf(ctx.db, run, steps);
  if (!diagnostics) return { failCode: "no_data_record" };
  const draft = await diagnosisAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.diagnose));
  const result = runChecks(draft, diagnostics);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

const NOT_ENOUGH = "Not enough data";

function sourcesOf(figures: Figure[]) {
  return [...new Set(figures.flatMap((row) => row.sourceRefIds))];
}

/** Figures saved as claims when no diagnosis was written to say which ones matter. */
const UNCITED_FIGURES = 40;

/** Each figure as a claim: the number, where it came from, and whether code computed it. */
function figureClaims(figures: Figure[]): Claim[] {
  return figures.map((row) => ({
    claimKey: `figure-${row.id}`,
    statement: `${row.label}: ${row.display}${row.computed && row.formula ? ` (computed: ${row.formula})` : ""}${row.period ? `, ${row.period}` : ""}.`,
    basis: "firstParty",
    ...(row.computed ? { computed: true } : {}),
    sourceRefIds: row.sourceRefIds,
  }));
}

function missingClaims(diagnostics: DiagnosticsRecord): Claim[] {
  return diagnostics.missing
    .filter((row) => row.stage !== "all" && row.text.startsWith(NOT_ENOUGH))
    .map((row) => ({ claimKey: `missing-${row.stage}`, statement: row.text, basis: "insufficient" }));
}

/** The claims one version of the diagnosis makes, before the evidence rules screen them. */
function diagnosisClaims(diagnosis: Diagnosis | null, diagnostics: DiagnosticsRecord): Claim[] {
  const byId = new Map(diagnostics.figures.map((row) => [row.id, row]));
  const cite = (ids: string[]) => ids.map((id) => byId.get(id)).filter((row): row is Figure => row !== undefined);
  // The figures the diagnosis rests on, each with its own source, so any number in it can be checked.
  const used = diagnosis ? cite([...new Set([...diagnosis.stageFigureIds, ...diagnosis.findings.flatMap((row) => row.figureIds), ...diagnosis.fixes.flatMap((row) => row.figureIds)])]) : diagnostics.figures.slice(0, UNCITED_FIGURES);
  const claims = [...figureClaims(used), ...missingClaims(diagnostics)];
  if (!diagnosis) return claims;
  // Findings from the business's data are firstParty; one built on a computed figure is marked computed.
  const firstParty = (claimKey: string, statement: string, figures: Figure[]): Claim => ({
    claimKey,
    statement,
    basis: "firstParty",
    ...(figures.some((row) => row.computed) ? { computed: true } : {}),
    sourceRefIds: sourcesOf(figures),
  });
  if (diagnosis.stage === "unknown") {
    claims.push({ claimKey: "stall-stage", statement: `${NOT_ENOUGH} to name the stage where growth stalls.`, basis: "insufficient" });
  } else {
    claims.push(firstParty("stall-stage", `Growth stalls at ${STAGE_WORDS[diagnosis.stage].toLowerCase()}: ${diagnosis.stageReason}`, cite(diagnosis.stageFigureIds)));
  }
  diagnosis.findings.forEach((row, i) => claims.push(firstParty(`finding-${i + 1}`, row.statement, cite(row.figureIds))));
  diagnosis.roadmap.forEach((row, i) => {
    const figures = cite(row.figureIds);
    const statement = `${row.problem} Action: ${row.action}. Watch ${row.targetMetric}; target: ${row.target}`;
    claims.push(
      figures.length
        ? { claimKey: `roadmap-${row.phase}-${i + 1}`, statement, basis: "inferred", sourceRefIds: sourcesOf(figures) }
        : { claimKey: `roadmap-${row.phase}-${i + 1}`, statement: row.problem.startsWith(NOT_ENOUGH) ? row.problem : `${NOT_ENOUGH}: ${statement}`, basis: "insufficient" },
    );
  });
  diagnosis.fixes.forEach((row, i) => {
    const figures = cite(row.figureIds);
    const statement = `${row.fix}. How to tell if it worked: ${row.howToTell}`;
    claims.push(figures.length ? { claimKey: `fix-${i + 1}`, statement, basis: "inferred", sourceRefIds: sourcesOf(figures) } : { claimKey: `fix-${i + 1}`, statement, basis: "hypothesis" });
  });
  return claims;
}

async function writeVersion(ctx: MutationCtx, run: Doc<"agentRuns">, assetId: Id<"assets">, version: number, body: string, claims: Claim[]) {
  const screened = await screenClaims(ctx, run.workspaceId, claims);
  const versionId = await ctx.db.insert("assetVersions", { workspaceId: run.workspaceId, assetId, version, body, createdBy: "agent" });
  for (const claim of screened.kept) {
    const ids = (claim.sourceRefIds ?? []).map((raw) => ctx.db.normalizeId("sourceRefs", raw)).filter((id): id is Id<"sourceRefs"> => id !== null);
    await ctx.db.insert("evidence", {
      workspaceId: run.workspaceId,
      assetVersionId: versionId,
      claimKey: claim.claimKey,
      statement: claim.statement,
      basis: claim.basis,
      ...(claim.computed ? { computed: true } : {}),
      ...(ids.length ? { sourceRefIds: ids } : {}),
    });
  }
  return screened.dropped;
}

/**
 * Save: the diagnosis as a growthDiagnosis asset with one evidence row per claim. With no first-party data,
 * one version says "Not enough data" and what to connect, and nothing else. Otherwise version 1 is the first
 * draft with its checks, and a revision, when one ran, is version 2. A diagnosis that passed waits for
 * approval; one that did not, or had no data, is Needs Review.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const project = await projectOf(ctx.db, run);
  const diagnostics = await diagnosticsOf(ctx.db, run, steps);
  if (!project || !diagnostics) return { failCode: "no_project" };
  const base = { workspaceId: run.workspaceId, kind: "growthDiagnosis" as const, title: `Growth diagnosis: ${project.title}`.slice(0, 200), createdByRun: run._id, createdAt: Date.now() };

  if (!diagnostics.hasData) {
    const assetId = await ctx.db.insert("assets", { ...base, status: "needsReview", currentVersion: 1 });
    const statement = `${NOT_ENOUGH}: ${diagnostics.missing.slice(1).map((row) => row.text).join(" ")}`;
    const dropped = await writeVersion(ctx, run, assetId, 1, renderNotEnough(diagnostics), [{ claimKey: "not-enough-data", statement, basis: "insufficient" }]);
    await ctx.scheduler.runAfter(0, internal.emailReminders.sendReportReady, { assetId });
    return { resultId: assetId, resultCode: "not_enough_data", artifact: record("diagnosis", { diagnosis: null, missing: diagnostics.missing, dropped }) };
  }

  const first = await diagnosisAt(ctx, run, latestDone(steps, PHASE.diagnose));
  const second = await diagnosisAt(ctx, run, latestDone(steps, PHASE.revise));
  const checksAt = async (phase: string) => {
    const step = latestDone(steps, phase);
    return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
  };
  const firstChecks = (await checksAt(PHASE.check)) ?? { passed: false, results: [] };
  const finalChecks = second ? ((await checksAt(PHASE.recheck)) ?? { passed: false, results: [] }) : firstChecks;
  const finalDiagnosis = second ?? first;
  const passed = finalChecks.passed && finalDiagnosis !== null;

  const notes: string[] = [];
  if (!first) notes.push("The diagnosis could not be written within the run's budget. The figures below are still your own, computed in code.");
  const revise = latest(steps, PHASE.revise);
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");

  const assetId = await ctx.db.insert("assets", { ...base, status: passed ? "draft" : "needsReview", currentVersion: second ? 2 : 1 });
  const bodyFor = (diagnosis: Diagnosis | null, checks: ChecksRecord, lines: string[]) =>
    diagnosis
      ? renderDiagnosis(diagnosis, diagnostics, checks, lines)
      : renderDiagnosis({ summary: "", stage: "unknown", stageReason: "", stageFigureIds: [], findings: [], fixes: [], roadmap: [], limits: [] }, diagnostics, { passed: false, results: [] }, lines);
  const droppedFirst = await writeVersion(ctx, run, assetId, 1, bodyFor(first, firstChecks, notes), diagnosisClaims(first, diagnostics));
  const droppedSecond = second ? await writeVersion(ctx, run, assetId, 2, bodyFor(second, finalChecks, []), diagnosisClaims(second, diagnostics)) : [];
  // Tells Owners and Managers by email that it waits for them. Scheduled, so a send failure never fails the run.
  await ctx.scheduler.runAfter(0, internal.emailReminders.sendReportReady, { assetId });
  return {
    resultId: assetId,
    resultCode: passed ? "ok" : "needs_review",
    artifact: record("diagnosis", { diagnosis: finalDiagnosis, checks: finalChecks, versions: second ? 2 : 1, dropped: second ? droppedSecond : droppedFirst }),
  };
};

/** Code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const GD_MUTATION_TOOLS: Record<string, MutationTool> = {
  "gd.read": read,
  "gd.check": check,
  "gd.save": save,
};
