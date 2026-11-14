/**
 * Deal Briefing's code-only tools: read the lead through the shared CRM layer, their linked calls, the
 * setter's hand-off and the Playbook; check the model's brief; and save it with one evidence row per claim.
 * Nothing here calls a CRM, changes one, or contacts anybody.
 */

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { SALES_CONVERSION } from "../../catalog";
import { crmFor, type CrmView } from "../../lib/crm/read";
import type { CrmAppointment, CrmDeal } from "../../lib/crm/types";
import { screenClaims, type ClaimInput } from "../../lib/evidence";
import { playbookForSkill } from "../../lib/playbook";
import { canonicalUrl } from "../../lib/sourceRefs";
import { transcriptsFor, transcriptUrl } from "../../transcripts";
import { latest, latestDone, projectOf, recordOf } from "../marketIntelligence/records";
import type { ToolOutcome } from "../marketIntelligence/tools";
import { saveCrmSource } from "../pipelineForensics/tools";
import type { SkillContext } from "../types";
import { runChecks } from "./checks";
import { computeBrief, when, type BriefInput } from "./compute";
import { KIND_WORDS, kindOf, readinessOf, renderBrief, renderCodeOnly, viewOf } from "./render";
import type { BriefView } from "../../lib/dealmaker/briefView";
import { BRIEF_LIMITS, FIT_WORDS, NOT_ENOUGH_DATA, PHASE, readBrief, readResearch, siteFor, type Brief, type BriefRecord, type ChecksRecord, type SiteLine } from "./shapes";
import { PERSONAL } from "./checks";
import { internal } from "../../_generated/api";

type Step = Doc<"runSteps">;
type MutationTool = (ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[]) => Promise<ToolOutcome>;
type Claim = ClaimInput & { statement: string };
type Db = MutationCtx["db"] | SkillContext["db"];

const DAY = 86_400_000;
const record = (kind: string, value: unknown) => ({ kind, body: JSON.stringify(value) });

/** The brief a run is for, found by the run's own project. */
export async function briefingOf(db: Db, run: Pick<Doc<"agentRuns">, "workspaceId" | "inputRef">) {
  const project = await projectOf(db, run);
  if (!project) return null;
  const row = await db
    .query("dealBriefings")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .first();
  return row && row.workspaceId === run.workspaceId ? row : null;
}

export async function briefOf(db: Db, run: Pick<Doc<"agentRuns">, "_id" | "workspaceId">, steps: SkillContext["steps"]) {
  const step = latestDone(steps, PHASE.read);
  return step ? ((await recordOf(db, run, step._id, "brief")) as BriefRecord | null) : null;
}

async function briefAt(ctx: MutationCtx, run: Doc<"agentRuns">, step: Step | null): Promise<Brief | null> {
  return step ? readBrief(await recordOf(ctx.db, run, step._id, "model")) : null;
}

/** One "Your data" source on the project: a call, the setter's hand-off or a note about the lead. */
async function saveSource(ctx: MutationCtx, project: Doc<"researchProjects">, runId: Id<"agentRuns">, url: string, fields: { title: string; excerpt: string; observedAt: number; limitation: string }) {
  const canonical = canonicalUrl(url) ?? url;
  const values = { title: fields.title.slice(0, 200), excerpt: fields.excerpt.replace(/\s+/g, " ").trim().slice(0, 300), publisher: "Your business", observedAt: fields.observedAt, runId, limitation: fields.limitation };
  const existing = await ctx.db
    .query("sourceRefs")
    .withIndex("by_workspace_project_canonical", (q) => q.eq("workspaceId", project.workspaceId).eq("projectId", project._id).eq("canonicalUrl", canonical))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return existing._id;
  }
  return ctx.db.insert("sourceRefs", { workspaceId: project.workspaceId, projectId: project._id, origin: "supplied", platform: "customerData", kind: "dataset", url, canonicalUrl: canonical, availability: "available", ...values });
}

/** The deal this brief is about: the one asked for, else the lead's open deal updated last. */
async function dealFor(crm: CrmView, contactRef: string, dealRef: string | undefined): Promise<CrmDeal | null> {
  if (dealRef) {
    const deal = await crm.deal(dealRef);
    return deal && deal.contactRef === contactRef ? deal : null;
  }
  const deals = (await crm.deals({ open: true })).filter((row) => row.contactRef === contactRef);
  return deals.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
}

/** Observe: the lead as the CRM records them, their linked calls, what a person typed, and the Playbook. */
const read: MutationTool = async (ctx, run) => {
  const project = await projectOf(ctx.db, run);
  const briefing = await briefingOf(ctx.db, run);
  if (!project || !briefing) return { failCode: "no_briefing" };
  const now = Date.now();
  const scope = { workspaceId: run.workspaceId, ...(briefing.clientId ? { clientId: briefing.clientId } : {}) };
  const crm = await crmFor(ctx, scope);
  const input: BriefInput = {
    briefingId: briefing._id,
    projectId: project._id,
    leadName: briefing.leadName,
    crm: crm ? { label: crm.connection.label, accountName: crm.connection.accountName, currency: crm.connection.currency, timezone: crm.connection.timezone } : null,
    contact: null,
    deal: null,
    stage: null,
    call: null,
    activities: [],
    appointments: [],
    transcripts: [],
    handoff: briefing.handoff ? { text: briefing.handoff, by: briefing.writtenBy ?? "a teammate" } : null,
    about: briefing.about ? { text: briefing.about, by: briefing.writtenBy ?? "a teammate" } : null,
    site: siteFor(briefing.website, null),
    playbook: (await playbookForSkill(ctx, scope)).items.map((row) => ({ id: row._id, folder: row.folder, kind: row.kind, title: row.title, body: row.body, basis: row.basis })),
    now,
  };
  if (crm && briefing.contactRef) {
    input.contact = await crm.contact(briefing.contactRef);
    if (input.contact) {
      input.site = siteFor(briefing.website, input.contact.email);
      const contactRef = input.contact.ref;
      input.deal = await dealFor(crm, contactRef, briefing.dealRef);
      if (input.deal) {
        const pipeline = (await crm.pipelines()).find((row) => row.ref === input.deal!.pipelineRef);
        const stage = pipeline?.stages.find((row) => row.ref === input.deal!.stageRef);
        input.stage = pipeline && stage ? { pipeline: pipeline.name, stage: stage.name } : null;
      }
      const span = BRIEF_LIMITS.appointmentDays * DAY;
      const appointments: CrmAppointment[] = (await crm.appointments({ from: now - span, to: now + span })).filter((row) => row.contactRef === contactRef);
      input.appointments = appointments;
      input.call = (briefing.appointmentRef ? appointments.find((row) => row.ref === briefing.appointmentRef) : appointments.find((row) => row.startsAt >= now)) ?? null;
      input.activities = await crm.activities({ contactRef, since: now - 365 * DAY });
      input.transcripts = (await transcriptsFor(ctx, { ...scope, agentSlug: SALES_CONVERSION, contactRef, limit: BRIEF_LIMITS.calls })).map((row) => ({ id: row._id, title: row.title, callDate: row.callDate ?? null, text: row.text }));
    }
  }

  const value = computeBrief(input);
  // Every fact and quote cites a "Your data" source on the project: the CRM, each call, the hand-off, the note.
  if (crm && input.contact) {
    value.refs.crm = await saveCrmSource(ctx, project, run._id, { id: crm.connection.id, label: crm.connection.label, accountName: crm.connection.accountName, lastReadAt: crm.connection.lastReadAt }, `${value.facts.length} facts about one lead read from your CRM.`);
  }
  for (const source of value.sources) {
    if (source.type === "call") {
      value.refs[source.id] = await saveSource(ctx, project, run._id, transcriptUrl(source.ref as Id<"callTranscripts">), { title: `Your call: ${source.label}`, excerpt: source.text, observedAt: now, limitation: "A transcript you provided. Vistrial cannot check it against the recording." });
    } else {
      value.refs[source.id] = await saveSource(ctx, project, run._id, `https://vistrial.io/app/agents/${SALES_CONVERSION}/work/calls?brief=${briefing._id}&note=${source.type}`, {
        title: source.label,
        excerpt: source.text,
        observedAt: briefing.createdAt,
        limitation: `${source.by}'s own account, as typed. It has an author and a perspective; it is not a recorded event.`,
      });
    }
  }
  return { resultCode: value.needsModel ? "ok" : "code_only", resultId: String(value.facts.length), artifact: record("brief", value) };
};

const check: MutationTool = async (ctx, run, steps) => {
  const brief = await briefOf(ctx.db, run, steps);
  if (!brief) return { failCode: "no_brief_record" };
  const draft = await briefAt(ctx, run, latestDone(steps, PHASE.revise) ?? latestDone(steps, PHASE.write));
  const result = runChecks(draft, brief);
  return { resultCode: result.passed ? "passed" : "checks_failed", artifact: record("checks", result) };
};

/** The claims one version of the brief makes, before the evidence rules screen them. */
export function briefClaims(brief: Brief | null, value: BriefRecord): Claim[] {
  const crm = value.refs.crm ? [value.refs.crm] : [];
  const refsOf = (ids: string[]) => [...new Set(ids.map((id) => value.refs[id]).filter((id): id is string => Boolean(id)))];
  const claims: Claim[] = [];
  for (const row of value.facts) {
    const statement = `${row.label}: ${row.display} (${row.kind === "measured" ? `${KIND_WORDS.measured}: ${row.formula}` : KIND_WORDS.recorded}).`;
    claims.push(crm.length ? { claimKey: `fact-${row.id}`, statement, basis: "firstParty", ...(row.kind === "measured" ? { computed: true } : {}), sourceRefIds: crm } : { claimKey: `fact-${row.id}`, statement: `${NOT_ENOUGH_DATA}: ${statement}`, basis: "insufficient" });
  }
  const sources = new Map(value.sources.map((row) => [row.id, row]));
  for (const row of readinessOf(brief, value)) {
    if (!row.established) {
      claims.push({ claimKey: `ready-${row.field}`, statement: `${NOT_ENOUGH_DATA}: ${FIT_WORDS[row.field].toLowerCase()} is unresolved.`, basis: "insufficient" });
      continue;
    }
    const cited = brief!.readiness.find((item) => item.field === row.field && item.quote === row.quote)!;
    claims.push({ claimKey: `ready-${row.field}`, statement: `${FIT_WORDS[row.field]}: ${row.finding} (${row.words}, ${row.source}: "${row.quote}")`, basis: "firstParty", sourceRefIds: refsOf([cited.sourceId]) });
  }
  if (!brief) return claims;
  brief.commitments.forEach((row, i) => {
    const source = sources.get(row.sourceId);
    if (!source) return;
    claims.push({ claimKey: `commitment-${i + 1}`, statement: `${row.owner === "us" ? "We" : value.leadName}: ${row.what}${row.due ? ` (by ${row.due})` : ""}. ${kindOf(source, row.quote, value.leadName).words}: "${row.quote}"`, basis: "firstParty", sourceRefIds: refsOf([row.sourceId]) });
  });
  // A reading of what is known: an inference when it rests on a saved source, else an untested hypothesis.
  const reading = (claimKey: string, statement: string, ids: string[]): Claim => {
    const refs = refsOf(ids);
    return refs.length ? { claimKey, statement, basis: "inferred", sourceRefIds: refs } : { claimKey, statement, basis: "hypothesis" };
  };
  claims.push(reading("summary", brief.summary, [...value.sources.map((row) => row.id), ...(crm.length ? ["crm"] : [])]));
  brief.cover.forEach((row, i) => claims.push(reading(`cover-${i + 1}`, `Cover: ${row.point}`, row.refs.map((id) => (id.startsWith("F") ? "crm" : id)))));
  brief.objections.forEach((row, i) => claims.push(reading(`objection-${i + 1}`, `Likely objection: ${row.objection}`, sources.has(row.sourceId) ? [row.sourceId] : [])));
  const fit = value.playbook.find((row) => row.id === brief.offerFit.itemId);
  if (fit) claims.push(reading("offer-fit", `The package that fits: ${fit.title}. ${brief.offerFit.why}`, value.sources.map((row) => row.id)));
  brief.disagreements.forEach((row, i) => claims.push(reading(`disagreement-${i + 1}`, `Records disagree: ${row.what}`, row.refs.map((id) => (id.startsWith("F") ? "crm" : id)))));
  claims.push(reading("opening", `Opening question: ${brief.openingQuestion}`, value.sources.map((row) => row.id)));
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
 * Save: a preCallBrief asset with one evidence row per claim, and the brief marked ready. It never leaves
 * Vistrial, so it waits for no approval (answer 12.3): a brief that passed is a draft, one that did not is
 * Needs Review. With nothing to write over, code's own brief is saved and no model was called.
 */
/**
 * The public read, checked in code: a line is kept only when it cites a page the fetch actually returned, on
 * the lead's own site, and says nothing about a person. Each kept page is saved as an Observed web source.
 */
async function publicRead(ctx: MutationCtx, run: Doc<"agentRuns">, steps: Step[], value: BriefRecord): Promise<Claim[]> {
  if (!value.site) return [];
  const step = latestDone(steps, PHASE.research);
  if (!step) {
    const skipped = latest(steps, PHASE.research);
    value.missing.push(skipped?.resultCode === "over_budget" ? "The lead's website was not read: the brief's budget could not cover it." : "The lead's website could not be read.");
    return [];
  }
  const project = await projectOf(ctx.db, run);
  const saved = (await recordOf(ctx.db, run, step._id, "sources")) as { sources?: { url?: unknown; title?: unknown }[] } | null;
  const fetched = new Map<string, { url: string; title: string | null }>();
  for (const row of saved?.sources ?? []) {
    if (typeof row.url !== "string") continue;
    const key = canonicalUrl(row.url);
    if (key) fetched.set(key, { url: row.url, title: typeof row.title === "string" ? row.title : null });
  }
  const onSite = (url: string) => {
    try {
      const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
      return host === value.site!.domain || host.endsWith(`.${value.site!.domain}`);
    } catch {
      return false;
    }
  };
  const kept: SiteLine[] = readResearch(await recordOf(ctx.db, run, step._id, "model"))
    .filter((row) => onSite(row.url) && fetched.has(canonicalUrl(row.url) ?? "") && !PERSONAL.test(row.text))
    .slice(0, BRIEF_LIMITS.siteLines);
  if (!kept.length || !project) {
    value.missing.push("Nothing on the lead's website could be read and cited, so the brief has no public read.");
    return [];
  }
  value.publicRead = { domain: value.site.domain, from: value.site.from, lines: kept };
  const claims: Claim[] = [];
  const refs = new Map<string, Id<"sourceRefs">>();
  for (const [i, row] of kept.entries()) {
    const key = canonicalUrl(row.url)!;
    if (!refs.has(key)) {
      const page = fetched.get(key)!;
      const existing = await ctx.db
        .query("sourceRefs")
        .withIndex("by_workspace_project_canonical", (q) => q.eq("workspaceId", run.workspaceId).eq("projectId", project._id).eq("canonicalUrl", key))
        .first();
      refs.set(
        key,
        existing?._id ??
          (await ctx.db.insert("sourceRefs", {
            workspaceId: run.workspaceId,
            projectId: project._id,
            runId: run._id,
            origin: "found",
            platform: "web",
            kind: "page",
            url: page.url,
            canonicalUrl: key,
            title: (page.title ?? value.site.domain).slice(0, 200),
            publisher: value.site.domain,
            observedAt: Date.now(),
            availability: "available",
            limitation: "The lead's own website: what the business says about itself, not checked elsewhere.",
          })),
      );
    }
    claims.push({ claimKey: `public-${i + 1}`, statement: `On ${value.site.domain}: ${row.text}`, basis: "observed", sourceRefIds: [refs.get(key)!] });
  }
  return claims;
}

/** Tells the closer their brief is ready, when the closer is not the person who asked for it. */
async function announce(ctx: MutationCtx, briefingId: Id<"dealBriefings">) {
  await ctx.scheduler.runAfter(0, internal.briefEmail.sendBriefReady, { briefingId });
}

const save: MutationTool = async (ctx, run, steps) => {
  const value = await briefOf(ctx.db, run, steps);
  const briefing = await briefingOf(ctx.db, run);
  if (!value || !briefing) return { failCode: "no_briefing" };
  const siteClaims = await publicRead(ctx, run, steps, value);
  const title = `Pre-call brief: ${value.leadName}${value.call ? `, ${when(value.call.startsAt, value.crm?.timezone ?? null)}` : ""}`;
  const base = { workspaceId: run.workspaceId, ...(run.clientId ? { clientId: run.clientId } : {}), kind: "preCallBrief" as const, title: title.slice(0, 200), createdByRun: run._id, createdAt: Date.now() };
  const done = async (assetId: Id<"assets">, view: BriefView) => {
    await ctx.db.patch(briefing._id, { status: "ready", assetId, view, finishedAt: Date.now() });
    await announce(ctx, briefing._id);
  };

  if (!value.needsModel) {
    const assetId = await ctx.db.insert("assets", { ...base, status: "draft", currentVersion: 1 });
    const dropped = await writeVersion(ctx, run, assetId, 1, renderCodeOnly(value), [...briefClaims(null, value), ...siteClaims]);
    await done(assetId, viewOf(null, value, true));
    return { resultId: assetId, resultCode: "code_only", artifact: record("saved", { brief: null, dropped }) };
  }

  const first = await briefAt(ctx, run, latestDone(steps, PHASE.write));
  const second = await briefAt(ctx, run, latestDone(steps, PHASE.revise));
  const checksAt = async (phase: string) => {
    const step = latestDone(steps, phase);
    return step ? ((await recordOf(ctx.db, run, step._id, "checks")) as ChecksRecord | null) : null;
  };
  const firstChecks = (await checksAt(PHASE.check)) ?? { passed: false, results: [] };
  const finalChecks = second ? ((await checksAt(PHASE.recheck)) ?? { passed: false, results: [] }) : firstChecks;
  const final = second ?? first;
  const passed = finalChecks.passed && final !== null;

  if (!first) {
    // The model could not write within the budget: the closer still gets what code knows.
    const assetId = await ctx.db.insert("assets", { ...base, status: "needsReview", currentVersion: 1 });
    const dropped = await writeVersion(ctx, run, assetId, 1, `${renderCodeOnly(value)}\n\n_The rest of the brief could not be written within its budget._`, [...briefClaims(null, value), ...siteClaims]);
    await done(assetId, { ...viewOf(null, value, false), missing: [...value.missing, "The rest of the brief could not be written within its budget."] });
    return { resultId: assetId, resultCode: "needs_review", artifact: record("saved", { brief: null, dropped }) };
  }

  const notes: string[] = [];
  const revise = latest(steps, PHASE.revise);
  if (!firstChecks.passed && revise?.kind === "note" && revise.resultCode === "over_budget") notes.push("The revision was not run because the reserve could not cover it.");
  if (!firstChecks.passed && second) notes.push("A revision follows as version 2.");

  const assetId = await ctx.db.insert("assets", { ...base, status: passed ? "draft" : "needsReview", currentVersion: second ? 2 : 1 });
  const droppedFirst = await writeVersion(ctx, run, assetId, 1, renderBrief(first, value, firstChecks, notes), [...briefClaims(first, value), ...siteClaims]);
  const droppedSecond = second ? await writeVersion(ctx, run, assetId, 2, renderBrief(second, value, finalChecks, []), [...briefClaims(second, value), ...siteClaims]) : [];
  await done(assetId, viewOf(final, value, passed));
  return {
    resultId: assetId,
    resultCode: passed ? "ok" : "needs_review",
    artifact: record("saved", { brief: final, checks: finalChecks, readiness: readinessOf(final, value), versions: second ? 2 : 1, dropped: second ? droppedSecond : droppedFirst }),
  };
};

/** Code-only tools, by slug. They run in the commit mutation, with the step marker. */
export const DBR_MUTATION_TOOLS: Record<string, MutationTool> = {
  "dbr.read": read,
  "dbr.check": check,
  "dbr.save": save,
};
