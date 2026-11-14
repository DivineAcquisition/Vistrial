/**
 * Dealmaker's guided interview, asked only for the gaps (docs/rebuild/dealmaker.md, 0.6). It reads the CRM's
 * stages and the Playbook first, then asks the questions in lib/interview.ts that are still open. Answers
 * become Playbook items from the interview ("Your data") or Dealmaker's settings for this business. No model
 * is called. Owners, Admins and Members answer; a Viewer reads.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { clientForNew, clientHere, type ClientScope } from "./lib/clients";
import { crmFor } from "./lib/crm/read";
import { userError } from "./lib/errors";
import { CHANNELS, CHANNEL_LABEL, DEFAULT_QUIET_DAYS, INTERVIEW_LIMITS, INTERVIEW_TEXT, QUESTIONS, QUIET_CHOICES, openQuestions, scriptGaps, type QuestionId } from "./lib/interview";
import { LIMITS, PLAYBOOK_TEXT, STAGE_LABEL, basisFor, clean, cleanBody, itemsOf, stage, type Folder, type Kind, type Stage, STAGE_FOLDER } from "./lib/playbook";

type Ctx = QueryCtx & { workspaceId: Id<"workspaces">; clients: ClientScope };
type Scope = { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> };

async function readScope(ctx: Ctx, clientId: Id<"clients"> | undefined): Promise<Scope> {
  if (!clientId) {
    ctx.clients.require(undefined);
    return { workspaceId: ctx.workspaceId };
  }
  const client = await clientHere(ctx, ctx.workspaceId, clientId);
  ctx.clients.require(client._id);
  return { workspaceId: ctx.workspaceId, clientId: client._id };
}

export async function settingsOf(ctx: Pick<QueryCtx, "db">, scope: Scope): Promise<Doc<"dealmakerSettings"> | null> {
  return ctx.db
    .query("dealmakerSettings")
    .withIndex("by_workspace_client", (q) => q.eq("workspaceId", scope.workspaceId).eq("clientId", scope.clientId))
    .first();
}

/** The CRM's stages, in order, for the main pipeline it reports first. */
async function crmStages(ctx: QueryCtx, scope: Scope) {
  const crm = await crmFor(ctx, scope);
  if (!crm) return null;
  const [pipeline] = await crm.pipelines();
  return pipeline ? [...pipeline.stages].sort((a, b) => a.order - b.order).map((row) => ({ ref: row.ref, name: row.name })) : [];
}

/** What the interview still asks, with what each question needs to be shown. */
export const view = workspaceQuery({
  args: { clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const scope = await readScope(ctx, args.clientId);
    const [items, settings, stages] = await Promise.all([itemsOf(ctx, scope), settingsOf(ctx, scope), crmStages(ctx, scope)]);
    const skipped = new Set(settings?.skipped ?? []);
    const open = openQuestions({ items, settings, stages }).filter((id) => !skipped.has(id));
    const meanings = new Map((settings?.stageMeanings ?? []).map((row) => [row.stageRef, row.meaning]));
    return {
      questions: QUESTIONS.filter((row) => open.includes(row.id)).map((row) => ({ id: row.id, title: row.title, ask: row.ask })),
      total: QUESTIONS.length,
      stages: (stages ?? []).map((row) => ({ ...row, meaning: meanings.get(row.ref) ?? "" })),
      scriptStages: scriptGaps(items).map((row) => ({ id: row, label: STAGE_LABEL[row] })),
      quietDays: { value: settings?.quietDays ?? null, choices: [...QUIET_CHOICES], suggested: DEFAULT_QUIET_DAYS },
      channels: CHANNELS.map((id) => ({ id, label: CHANNEL_LABEL[id], on: (settings?.channels ?? []).includes(id) })),
      consentTags: settings?.consentTags ?? [],
      canEdit: ctx.role !== "viewer",
    };
  },
});

async function writeSettings(ctx: MutationCtx & { identity: { subject: string } }, scope: Scope, patch: Partial<Doc<"dealmakerSettings">>) {
  const row = await settingsOf(ctx, scope);
  const stamp = { updatedBy: ctx.identity.subject, updatedAt: Date.now() };
  if (row) await ctx.db.patch(row._id, { ...patch, ...stamp });
  else await ctx.db.insert("dealmakerSettings", { workspaceId: scope.workspaceId, ...(scope.clientId ? { clientId: scope.clientId } : {}), ...patch, ...stamp });
}

async function fileItems(ctx: MutationCtx & { identity: { subject: string } }, scope: Scope, rows: { folder: Folder; kind: Kind; stage?: Stage; title: string; body: string }[]) {
  const live = await itemsOf(ctx, scope);
  if (live.length + rows.length > LIMITS.items) throw userError(PLAYBOOK_TEXT.full);
  const now = Date.now();
  for (const row of rows) {
    await ctx.db.insert("playbookItems", {
      workspaceId: scope.workspaceId,
      ...(scope.clientId ? { clientId: scope.clientId } : {}),
      folder: row.folder,
      kind: row.kind,
      ...(row.stage ? { stage: row.stage } : {}),
      title: clean(row.title, LIMITS.title),
      body: cleanBody(row.body),
      source: { type: "interview" },
      basis: basisFor("interview"),
      status: "active",
      createdBy: ctx.identity.subject,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function audit(ctx: MutationCtx & { workspaceId: Id<"workspaces">; identity: { subject: string } }, question: QuestionId) {
  await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: `dealmaker.interview_${question}`, subject: ctx.workspaceId });
}

const firstLine = (text: string) => clean(text.split(/[.\n]/)[0] ?? text, LIMITS.title) || clean(text, LIMITS.title);

/** What each CRM stage means. Only stages the CRM reports are taken. */
export const answerStages = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), meanings: v.array(v.object({ stageRef: v.string(), meaning: v.string() })) },
  handler: async (ctx, args) => {
    const scope = await clientForNew(ctx, args.clientId).then((row) => ({ workspaceId: ctx.workspaceId, ...row }));
    const stages = (await crmStages(ctx, scope)) ?? [];
    const byRef = new Map(stages.map((row) => [row.ref, row.name]));
    const kept = new Map(((await settingsOf(ctx, scope))?.stageMeanings ?? []).map((row) => [row.stageRef, row]));
    for (const row of args.meanings) {
      const name = byRef.get(row.stageRef);
      if (!name) throw userError(INTERVIEW_TEXT.unknownStage);
      const meaning = clean(row.meaning, INTERVIEW_LIMITS.meaning);
      if (meaning) kept.set(row.stageRef, { stageRef: row.stageRef, name, meaning });
    }
    await writeSettings(ctx, scope, { stageMeanings: [...kept.values()] });
    await audit(ctx, "stages");
    return null;
  },
});

export const answerQuietDays = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), days: v.number() },
  handler: async (ctx, args) => {
    if (!(QUIET_CHOICES as readonly number[]).includes(args.days)) throw userError(INTERVIEW_TEXT.badQuiet);
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    await writeSettings(ctx, scope, { quietDays: args.days });
    await audit(ctx, "quietDays");
    return null;
  },
});

/** The script, one answer per call stage still missing. Each becomes a script step in its stage's folder. */
export const answerScript = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), steps: v.array(v.object({ stage, text: v.string() })) },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    const rows = args.steps
      .map((row) => ({ stage: row.stage, text: cleanBody(row.text).slice(0, INTERVIEW_LIMITS.answer) }))
      .filter((row) => row.text)
      .map((row) => ({ folder: STAGE_FOLDER[row.stage], kind: "scriptStep" as const, stage: row.stage, title: firstLine(row.text), body: row.text }));
    if (!rows.length) throw userError(INTERVIEW_TEXT.empty);
    await fileItems(ctx, scope, rows);
    await audit(ctx, "script");
    return null;
  },
});

/** A package, with the price a proposal may use. */
export const answerPackage = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), name: v.string(), includes: v.string(), price: v.string() },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    const name = clean(args.name, LIMITS.title);
    if (!name) throw userError(INTERVIEW_TEXT.empty);
    const price = clean(args.price, LIMITS.title);
    const rows: { folder: Folder; kind: Kind; title: string; body: string }[] = [{ folder: "offer", kind: "package", title: name, body: args.includes.slice(0, INTERVIEW_LIMITS.answer) }];
    if (price) rows.push({ folder: "offer", kind: "price", title: `${name}: ${price}`.slice(0, LIMITS.title), body: "The price a proposal may use." });
    await fileItems(ctx, scope, rows);
    await audit(ctx, "packages");
    return null;
  },
});

/** Proof Dealmaker may quote: one line each. */
export const answerProof = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), lines: v.array(v.string()) },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    const lines = args.lines.map((row) => clean(row, INTERVIEW_LIMITS.answer)).filter(Boolean).slice(0, INTERVIEW_LIMITS.proof);
    if (!lines.length) throw userError(INTERVIEW_TEXT.empty);
    await fileItems(ctx, scope, lines.map((line) => ({ folder: "offer" as const, kind: "proof" as const, title: firstLine(line), body: line })));
    await audit(ctx, "proof");
    return null;
  },
});

export const answerVoice = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), voice: v.string(), signOff: v.string() },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    const voice = cleanBody(args.voice).slice(0, INTERVIEW_LIMITS.answer);
    const signOff = clean(args.signOff, LIMITS.title);
    if (!voice && !signOff) throw userError(INTERVIEW_TEXT.empty);
    await fileItems(ctx, scope, [{ folder: "closing", kind: "voice", title: signOff ? `Signed “${signOff}”` : firstLine(voice), body: voice }]);
    await audit(ctx, "voice");
    return null;
  },
});

/** The consent tags and the channels Dealmaker may draft for. Nothing is sent from here. */
export const answerConsent = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), tags: v.array(v.string()), channels: v.array(v.union(v.literal("sms"), v.literal("email"), v.literal("voice"), v.literal("dm"))) },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    if (!args.channels.length) throw userError(INTERVIEW_TEXT.noChannel);
    const tags = [...new Set(args.tags.map((row) => clean(row, INTERVIEW_LIMITS.tag)).filter(Boolean))].slice(0, INTERVIEW_LIMITS.tags);
    await writeSettings(ctx, scope, { consentTags: tags, channels: [...new Set(args.channels)] });
    await audit(ctx, "consent");
    return null;
  },
});

/** Skips a question for now; it can be answered later from the Playbook. */
export const skip = workspaceMutation({
  args: { clientId: v.optional(v.id("clients")), question: v.string() },
  handler: async (ctx, args) => {
    const scope = { workspaceId: ctx.workspaceId, ...(await clientForNew(ctx, args.clientId)) };
    if (!QUESTIONS.some((row) => row.id === args.question)) return null;
    const row = await settingsOf(ctx, scope);
    await writeSettings(ctx, scope, { skipped: [...new Set([...(row?.skipped ?? []), args.question])] });
    return null;
  },
});
