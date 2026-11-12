/**
 * Writing to the Briefing: the feed of what needs a decision, what finished, what changed and what to read.
 * Every post goes through `post`, which keeps a post with a `key` from being written twice and respects the
 * organization's switches. Reading the feed is convex/briefing.ts.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requestApproval, type ApprovalRequest } from "./approvals";
import { clientOfAsset } from "./clients";
import { syncTasks } from "./taskLinks";
import type { BriefingKind } from "./taskShapes";

const clip = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);
const clipBody = (text: string, max: number) => text.trim().slice(0, max);

export type BriefingPost = {
  workspaceId: Id<"workspaces">;
  clientId?: Id<"clients">;
  kind: BriefingKind;
  agentSlug?: string;
  title: string;
  body?: string;
  ref?: { table: string; id: string };
  approvalId?: Id<"approvals">;
  sources?: { title: string; url: string }[];
  credits?: number;
  /** A post with a key is written once per organization. */
  key?: string;
};

export async function settingsOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const row = await ctx.db
    .query("workspaceSettings")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .unique();
  return {
    spendApprovalCredits: row?.spendApprovalCredits ?? null,
    /** The weekly plan and growth report: on unless switched off. */
    weeklyPlan: row?.weeklyPlan !== false,
    /** Industry trend posts: off until switched on. */
    trendPosts: row?.trendPosts === true,
  };
}

/** Writes one post. Returns null when it was already written, or its kind is switched off for the organization. */
export async function post(ctx: MutationCtx, item: BriefingPost): Promise<Id<"briefingItems"> | null> {
  if (item.kind === "trend" && !(await settingsOf(ctx, item.workspaceId)).trendPosts) return null;
  if (item.key) {
    const existing = await ctx.db
      .query("briefingItems")
      .withIndex("by_workspace_key", (q) => q.eq("workspaceId", item.workspaceId).eq("key", item.key))
      .first();
    if (existing) return null;
  }
  return ctx.db.insert("briefingItems", {
    workspaceId: item.workspaceId,
    ...(item.clientId ? { clientId: item.clientId } : {}),
    kind: item.kind,
    ...(item.agentSlug ? { agentSlug: item.agentSlug } : {}),
    title: clip(item.title, 200),
    ...(item.body ? { body: clipBody(item.body, 4000) } : {}),
    ...(item.ref ? { refTable: item.ref.table, refId: item.ref.id } : {}),
    ...(item.approvalId ? { approvalId: item.approvalId } : {}),
    ...(item.sources?.length ? { sources: item.sources.slice(0, 8).map((source) => ({ title: clip(source.title, 160), url: source.url.slice(0, 500) })) } : {}),
    ...(item.credits !== undefined ? { credits: item.credits } : {}),
    ...(item.key ? { key: item.key } : {}),
    at: Date.now(),
  });
}

/**
 * Asks for a decision and puts it in the Briefing. A draft to review is posted as a draft, everything else
 * as an approval. Asking again for something already waiting writes nothing new.
 */
export async function askApproval(ctx: MutationCtx, request: ApprovalRequest, words?: { title?: string; body?: string }) {
  const { approvalId, created } = await requestApproval(ctx, request);
  if (created) {
    await post(ctx, {
      workspaceId: request.workspaceId,
      clientId: request.clientId,
      kind: request.subjectTable === "assets" ? "draft" : "approval",
      agentSlug: request.agentSlug,
      title: words?.title ?? request.summary,
      body: words?.body,
      ref: { table: request.subjectTable, id: request.subjectId },
      approvalId,
      credits: request.credits,
    });
  }
  return approvalId;
}

/** How an asset's review reads in the approvals queue: it is the sign-off before the work can go public. */
export async function assetApproval(ctx: QueryCtx, asset: Doc<"assets">, agentSlug?: string) {
  const clientId = await clientOfAsset(ctx, asset);
  return {
    workspaceId: asset.workspaceId,
    ...(clientId ? { clientId } : {}),
    kind: "publish" as const,
    subjectTable: "assets",
    subjectId: asset._id as string,
    summary: asset.title,
    ...(agentSlug ? { agentSlug } : {}),
  };
}

/** Puts a draft that is waiting for review into the approvals queue and the Briefing. */
export async function askAssetReview(ctx: MutationCtx, asset: Doc<"assets">, agentSlug?: string) {
  if (asset.status !== "draft" && asset.status !== "needsReview") return null;
  const slug = agentSlug ?? (asset.createdByRun ? (await ctx.db.get(asset.createdByRun))?.agentSlug : undefined);
  return askApproval(ctx, { ...(await assetApproval(ctx, asset, slug)), requestedBy: "agent" }, { title: `Draft to review: ${asset.title}` });
}

const STOP_WORDS: Record<string, string> = {
  cap: "It reached its credit or time limit before finishing.",
  error: "It failed. Nothing was charged beyond what it had already used.",
  cancelled: "It was stopped because agents are paused.",
  halted: "A person stopped it.",
};

/**
 * Called when a run ends or stops for a question. A finished run posts once ("finished", with a link to
 * what it made) and each draft it produced joins the approvals queue; a run that stopped short or is
 * waiting on a person posts an alert. A free onboarding session posts like any other.
 */
export async function runChanged(ctx: MutationCtx, runId: Id<"agentRuns">) {
  const run = await ctx.db.get(runId);
  if (!run) return;
  // A task whose work this run is moves with it.
  await syncTasks(ctx, run.workspaceId);
  const base = { workspaceId: run.workspaceId, clientId: run.clientId, agentSlug: run.agentSlug, ref: { table: "agentRuns", id: run._id as string } };
  if (run.status === "waiting" || run.status === "needsInput") {
    const question = run.waitingFor?.question;
    await post(ctx, { ...base, kind: "alert", title: "An agent is waiting on an answer", body: question, key: `question:${run._id}:${run.waitingFor?.questionId ?? run.status}` });
    return;
  }
  // The proposer's own runs speak through the tasks and the weekly report they write, not a post each.
  if (run.skillSlug === "task-proposer") return;
  if (run.status === "completed") {
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_workspace_run", (q) => q.eq("workspaceId", run.workspaceId).eq("createdByRun", run._id))
      .take(10);
    for (const asset of assets) await askAssetReview(ctx, asset, run.agentSlug);
    const first = assets[0];
    await post(ctx, {
      ...base,
      kind: "finished",
      title: first ? `Finished: ${first.title}` : "An agent finished its work",
      ref: first ? { table: "assets", id: first._id as string } : base.ref,
      key: `finished:${run._id}`,
    });
    return;
  }
  if (run.status === "failed" || run.status === "stopped") {
    // A person stopping their own run needs no alert.
    if (run.stopReason === "halted") return;
    await post(ctx, { ...base, kind: "alert", title: run.status === "failed" ? "An agent's work failed" : "An agent's work stopped early", body: STOP_WORDS[run.stopReason ?? "error"], key: `stopped:${run._id}` });
  }
}
