/**
 * Usage: who and what each credit charge was for, and the per-day rollup the usage page reads.
 * docs/rebuild/usage-page.md. Nothing here holds or returns a cost or the markup: only credits.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { dayKey } from "./caps";

export type LedgerSource = Doc<"billingLedger">["source"];

export type Attribution = {
  startedBy?: string;
  agentSlug?: string;
  skillSlug?: string;
  clientId?: Id<"clients">;
  /** The model that ran, when the thing charged keeps one. A run step's own model is passed in by the caller. */
  model?: string;
  title?: string;
};

/** The agent and skill that follow-ups and Creative images are part of (convex/catalog.ts). */
const GROWTH_ARCHITECT = "growth-architect";

function short(text: string | undefined, max = 90) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean || undefined;
}

/** Reads who started the work a ledger `ref` points at, which agent and skill it was, its client and model. */
export async function attributionFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, source: LedgerSource, ref: string): Promise<Attribution> {
  const db = ctx.db;
  const mine = <T extends { workspaceId: Id<"workspaces"> }>(row: T | null) => (row && row.workspaceId === workspaceId ? row : null);
  if (source === "run") {
    const id = db.normalizeId("agentRuns", ref);
    const run = mine(id ? await db.get(id) : null);
    if (!run) return {};
    return { startedBy: run.startedBy, agentSlug: run.agentSlug, skillSlug: run.skillSlug, clientId: run.clientId, model: run.madeWith?.model };
  }
  if (source === "followup") {
    const id = db.normalizeId("sessionChats", ref);
    const chat = mine(id ? await db.get(id) : null);
    if (!chat) return {};
    const project = await db.get(chat.projectId);
    return { startedBy: chat.createdBy, agentSlug: GROWTH_ARCHITECT, skillSlug: "market-intelligence", clientId: project?.clientId, model: chat.madeWith?.model, title: short(project?.title ? `Follow-up: ${project.title}` : "Follow-up question") };
  }
  if (source === "intake") {
    const id = db.normalizeId("intakes", ref);
    const intake = mine(id ? await db.get(id) : null);
    if (!intake) return {};
    const skill = intake.skillSlug && intake.skillSlug !== "undecided" ? intake.skillSlug : intake.skillSlug ? undefined : "market-intelligence";
    return { startedBy: intake.createdBy, agentSlug: intake.agentSlug, skillSlug: skill, clientId: intake.clientId, title: short(intake.context?.title ? `Chat about ${intake.context.title}` : "Chat") };
  }
  if (source === "file") {
    const fileId = db.normalizeId("sessionFiles", ref);
    const file = mine(fileId ? await db.get(fileId) : null);
    if (file) {
      const intake = file.intakeId ? await db.get(file.intakeId) : null;
      const project = file.projectId ? await db.get(file.projectId) : null;
      return { startedBy: file.createdBy, agentSlug: intake?.agentSlug ?? (project ? GROWTH_ARCHITECT : undefined), clientId: intake?.clientId ?? project?.clientId, title: short(`Read ${file.name}`) };
    }
    const referenceId = db.normalizeId("creativeReferences", ref);
    const reference = mine(referenceId ? await db.get(referenceId) : null);
    if (reference) return { startedBy: reference.createdBy, agentSlug: GROWTH_ARCHITECT, skillSlug: "creative-production", title: short(`Reference: ${reference.title}`) };
    return {};
  }
  if (source === "creative") {
    const id = db.normalizeId("creativeImages", ref);
    const image = mine(id ? await db.get(id) : null);
    if (!image) return {};
    const asset = await db.get(image.assetId);
    return { startedBy: image.createdBy, agentSlug: GROWTH_ARCHITECT, skillSlug: "creative-production", clientId: asset?.clientId, model: image.model, title: short(`Image: ${asset?.title ?? image.placement}`) };
  }
  const id = db.normalizeId("pageReadJobs", ref);
  const job = mine(id ? await db.get(id) : null);
  if (!job) return {};
  return { startedBy: job.startedBy, title: `Read ${job.pages === 1 ? "1 page" : `${job.pages} pages`}` };
}

/** Folds one charge into the day's row for its piece of work and model. Called beside every ledger insert. */
export async function addToUsage(
  ctx: MutationCtx,
  row: { workspaceId: Id<"workspaces">; source: LedgerSource; ref: string; priceCents: number; at: number; model?: string },
  who: Attribution,
  backfilled = false,
) {
  if (row.priceCents <= 0) return;
  const day = dayKey(row.at);
  const model = row.model ?? "";
  const existing = await ctx.db
    .query("usageItems")
    .withIndex("by_key", (q) => q.eq("workspaceId", row.workspaceId).eq("source", row.source).eq("ref", row.ref).eq("day", day).eq("model", model))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      priceCents: existing.priceCents + row.priceCents,
      charges: existing.charges + 1,
      firstAt: Math.min(existing.firstAt, row.at),
      lastAt: Math.max(existing.lastAt, row.at),
    });
    return;
  }
  await ctx.db.insert("usageItems", {
    workspaceId: row.workspaceId,
    source: row.source,
    ref: row.ref,
    day,
    model,
    priceCents: row.priceCents,
    charges: 1,
    firstAt: row.at,
    lastAt: row.at,
    ...(who.startedBy ? { startedBy: who.startedBy } : {}),
    ...(who.agentSlug ? { agentSlug: who.agentSlug } : {}),
    ...(who.skillSlug ? { skillSlug: who.skillSlug } : {}),
    ...(who.clientId ? { clientId: who.clientId } : {}),
    ...(who.title ? { title: who.title } : {}),
    ...(backfilled ? { backfilled: true } : {}),
  });
}
