/**
 * Playbook study's code-only tools: gather the sources a person chose, check each item the model proposed
 * against its source's own words, and file what passes. Nothing here calls a model or leaves the workspace.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { writeAudit } from "../../lib/audit";
import { LIMITS, basisFor, checkItem, clean, cleanBody, itemsOf, type Folder, type Kind, type ObjectionTag, type Stage } from "../../lib/playbook";
import { latestDone, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import type { SkillContext } from "../types";
import { PHASE, PLAYBOOK_SOURCE, STUDY_LIMITS, readExtract, type CheckedItem, type GatherRecord, type GatheredSource, type StudyChecks } from "./shapes";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;

const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

export async function studyOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const id = db.normalizeId("playbookStudies", run.inputRef);
  const study = id ? await db.get(id) : null;
  return study && study.workspaceId === run.workspaceId ? study : null;
}

export async function gatheredOf(db: MutationCtx["db"] | SkillContext["db"], run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.gather);
  return step ? ((await recordOf(db, run, step._id, "sources")) as GatherRecord | null) : null;
}

/** Folds whitespace and case so a quote matches its source however the model spaced it. */
export function normal(text: string) {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function cut(text: string) {
  return text.length > STUDY_LIMITS.sourceChars ? { text: text.slice(0, STUDY_LIMITS.sourceChars), cut: true } : { text, cut: false };
}

/** The text of an approved offer analysis, as plain lines the model can quote. */
function offerAnalysisText(body: string) {
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    const lines: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === "string") lines.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") Object.values(node).forEach(walk);
    };
    walk(value);
    return lines.join("\n");
  } catch {
    return body;
  }
}

/**
 * Observe: the sources the person chose, read from this workspace only. A transcript must still be shared
 * with Dealmaker and belong to the study's client; an analysis must still be approved. What cannot be read
 * is named, never guessed.
 */
const gather: MutationTool = async (ctx, run) => {
  const study = await studyOf(ctx.db, run);
  if (!study) return { failCode: "no_study" };
  const sources: GatheredSource[] = [];
  const missing: string[] = [];
  for (const [index, source] of study.sources.entries()) {
    const id = `s${index + 1}`;
    if (source.type === "text") {
      sources.push({ id, type: "text", ref: source.ref ?? id, label: source.label, ...cut(source.text ?? "") });
      continue;
    }
    if (source.type === "transcript") {
      const transcriptId = source.ref ? ctx.db.normalizeId("callTranscripts", source.ref) : null;
      const row = transcriptId ? await ctx.db.get(transcriptId) : null;
      if (!row || row.workspaceId !== run.workspaceId || row.clientId !== study.clientId || !(row.agents ?? []).includes(run.agentSlug)) {
        missing.push(`The call "${source.label}" is no longer shared with Dealmaker, so it was not read.`);
        continue;
      }
      sources.push({ id, type: "transcript", ref: row._id, label: row.title, ...cut(row.text) });
      continue;
    }
    const assetId = source.ref ? ctx.db.normalizeId("assets", source.ref) : null;
    const asset = assetId ? await ctx.db.get(assetId) : null;
    if (!asset || asset.workspaceId !== run.workspaceId || asset.kind !== "offerAnalysis" || asset.status !== "approved") {
      missing.push("Strategist's offer analysis is no longer approved, so it was not read.");
      continue;
    }
    const versions = await ctx.db
      .query("assetVersions")
      .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", run.workspaceId).eq("assetId", asset._id))
      .take(50);
    const version = versions.find((row) => row.version === asset.currentVersion);
    if (!version) {
      missing.push("Strategist's offer analysis could not be read.");
      continue;
    }
    sources.push({ id, type: "strategist", ref: asset._id, label: asset.title, ...cut(offerAnalysisText(version.body ?? "")) });
  }
  const existing = (await itemsOf(ctx, { workspaceId: run.workspaceId, clientId: study.clientId })).map((row) => row.title);
  const usable = sources.filter((row) => row.text.trim().length > 0);
  return { resultCode: usable.length ? "ok" : "nothing_to_read", resultId: String(usable.length), artifact: record("sources", { sources: usable, missing, existing } satisfies GatherRecord) };
};

/** Every proposed item, checked in code: it fits the Playbook's rules, cites a real source, and quotes it. */
export function checkExtracted(items: ReturnType<typeof readExtract>, gathered: GatherRecord): StudyChecks {
  const byId = new Map(gathered.sources.map((row) => [row.id, normal(row.text)]));
  const seen = new Set(gathered.existing.map(normal));
  const checked: CheckedItem[] = items.slice(0, STUDY_LIMITS.items * 2).map((item) => {
    const problem = checkItem({
      folder: item.folder as Folder,
      kind: item.kind as Kind,
      stage: (item.stage || undefined) as Stage | undefined,
      tag: (item.tag || undefined) as ObjectionTag | undefined,
      title: item.title,
      body: item.body,
    });
    const source = byId.get(item.sourceId);
    const quote = normal(item.quote);
    const title = normal(clean(item.title, LIMITS.title));
    let why = "";
    if (problem) why = problem;
    else if (item.kind === "scriptStep" && !item.stage) why = "A script step needs its call stage.";
    else if (source === undefined) why = "It cites no source that was read.";
    else if (quote.length < 8) why = "It quotes nothing from its source.";
    else if (!source.includes(quote)) why = "Its quote is not in the source.";
    else if (seen.has(title)) why = "The Playbook already has it.";
    if (!why) seen.add(title);
    return { ...item, accepted: !why, why };
  });
  let accepted = 0;
  for (const item of checked) {
    if (!item.accepted) continue;
    accepted += 1;
    if (accepted > STUDY_LIMITS.items) {
      item.accepted = false;
      item.why = `A study files at most ${STUDY_LIMITS.items} items.`;
      accepted -= 1;
    }
  }
  return { accepted, dropped: checked.length - accepted, items: checked };
}

const check: MutationTool = async (ctx, run, steps) => {
  const gathered = await gatheredOf(ctx.db, run, steps);
  if (!gathered) return { failCode: "no_sources_record" };
  const step = latestDone(steps, PHASE.extract);
  const items = readExtract(step ? await recordOf(ctx.db, run, step._id, "model") : null);
  const result = checkExtracted(items, gathered);
  return { resultCode: result.accepted ? "passed" : "nothing_accepted", resultId: String(result.accepted), artifact: record("checks", result) };
};

/**
 * Files what passed into the study's Playbook, each with its source and the words it quotes, labelled an
 * inference. Marks the study done with what was filed, dropped and missing.
 */
const save: MutationTool = async (ctx, run, steps) => {
  const study = await studyOf(ctx.db, run);
  if (!study) return { failCode: "no_study" };
  const gathered = await gatheredOf(ctx.db, run, steps);
  const checkStep = latestDone(steps, PHASE.check);
  const checks = checkStep ? ((await recordOf(ctx.db, run, checkStep._id, "checks")) as StudyChecks | null) : null;
  const scope = { workspaceId: run.workspaceId, clientId: study.clientId };
  const room = LIMITS.items - (await itemsOf(ctx, scope)).length;
  const sourceById = new Map((gathered?.sources ?? []).map((row) => [row.id, row]));
  const now = Date.now();
  const filed: Id<"playbookItems">[] = [];
  for (const item of (checks?.items ?? []).filter((row) => row.accepted)) {
    if (filed.length >= room) break;
    const source = sourceById.get(item.sourceId)!;
    const type = PLAYBOOK_SOURCE[source.type];
    const id = await ctx.db.insert("playbookItems", {
      workspaceId: run.workspaceId,
      ...(study.clientId ? { clientId: study.clientId } : {}),
      folder: item.folder as Folder,
      kind: item.kind as Kind,
      ...(item.stage ? { stage: item.stage as Stage } : {}),
      ...(item.tag ? { tag: item.tag as ObjectionTag } : {}),
      title: clean(item.title, LIMITS.title),
      body: cleanBody(item.body),
      quote: clean(item.quote, STUDY_LIMITS.quote),
      source: { type, ref: source.ref, label: clean(source.label, LIMITS.sourceLabel) },
      basis: basisFor(type, "inferred"),
      status: "active",
      createdBy: "agent",
      createdAt: now,
      updatedAt: now,
    });
    filed.push(id);
  }
  const missing = [...(gathered?.missing ?? [])];
  if ((gathered?.sources ?? []).some((row) => row.cut)) missing.push(`Long sources were read up to their first ${STUDY_LIMITS.sourceChars.toLocaleString("en-US")} characters.`);
  if (filed.length < (checks?.accepted ?? 0)) missing.push(`The Playbook is full at ${LIMITS.items} items, so ${(checks?.accepted ?? 0) - filed.length} were not filed.`);
  await ctx.db.patch(study._id, { status: "done", filed: filed.length, dropped: checks?.dropped ?? 0, missing, finishedAt: now });
  await writeAudit(ctx, { workspaceId: run.workspaceId, actorType: "system", actorId: run.agentSlug, action: "playbook.study_filed", subject: study._id });
  return { resultCode: gathered?.sources.length ? "ok" : "nothing_to_read", resultId: String(filed.length), artifact: record("filed", { filed, missing }) };
};

export const PBS_MUTATION_TOOLS: Record<string, MutationTool> = {
  "pbs.gather": gather,
  "pbs.check": check,
  "pbs.save": save,
};
