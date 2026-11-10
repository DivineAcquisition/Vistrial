/**
 * Running an ad set and learning from it: once a person approves an ad set they can mark it as running,
 * say when to check back, and later record what happened and which variation won. Figures come from the
 * business's own Meta results and results files, read at the start and again at the outcome. The next ad
 * set for the same brand reads the outcome, so it builds on what won. Vistrial never publishes: "running"
 * is the person's word that they put the ads live themselves.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { CHECK_IN_DAYS, changesBetween, currentFigures, type DecisionResult } from "./decisions";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, notFound, userError } from "./lib/errors";
import { savedRecord } from "./lib/savedRecords";
import type { CreativeRecord } from "./skills/creativeProduction/shapes";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NOTE = 500;
const MAX_LINE = 200;
const MAX_TESTS_IN_BRIEF = 5;

const resultValidator = v.union(v.literal("better"), v.literal("same"), v.literal("worse"), v.literal("tooEarly"), v.literal("notTried"));

const RESULT_WORDS: Record<DecisionResult, string> = {
  better: "it helped",
  same: "no clear change",
  worse: "it made things worse",
  tooEarly: "too early to tell",
  notTried: "it was not run",
};

function clip(text: string, max: number) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

function requireEditor(role: Doc<"members">["role"]) {
  if (role === "rep") notAllowed();
}

function view(test: Doc<"creativeTests">, now: number) {
  return {
    id: test._id,
    assetId: test.assetId,
    title: test.title,
    checkInAt: test.checkInAt,
    createdAt: test.createdAt,
    due: !test.outcome && test.checkInAt <= now,
    baseline: test.baseline,
    outcome: test.outcome
      ? {
          result: test.outcome.result,
          winner: test.outcome.winner ?? null,
          note: test.outcome.note,
          recordedAt: test.outcome.recordedAt,
          changes: changesBetween(test.baseline, test.outcome.after),
        }
      : null,
  };
}
export type TestView = ReturnType<typeof view>;

async function ownTest(ctx: QueryCtx, workspaceId: Id<"workspaces">, testId: Id<"creativeTests">) {
  const test = await ctx.db.get(testId);
  if (!test || test.workspaceId !== workspaceId) notFound();
  return test;
}

async function testOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, assetId: Id<"assets">) {
  return await ctx.db
    .query("creativeTests")
    .withIndex("by_workspace_asset", (q) => q.eq("workspaceId", workspaceId).eq("assetId", assetId))
    .first();
}

/** The test on one ad set, for the Creative tab. Null when it was never marked as running. */
export async function testFor(ctx: QueryCtx, workspaceId: Id<"workspaces">, assetId: Id<"assets">): Promise<TestView | null> {
  const test = await testOf(ctx, workspaceId, assetId);
  return test ? view(test, Date.now()) : null;
}

/** Where each ad set's test stands, for the list of ad sets. */
export async function testStates(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const now = Date.now();
  const rows = await ctx.db
    .query("creativeTests")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .take(200);
  return new Map<string, "running" | "due" | "recorded">(rows.map((row) => [row.assetId, row.outcome ? "recorded" : row.checkInAt <= now ? "due" : "running"]));
}

/** One line for the next brief: how the set did, and the variation that won, as it was written. */
export function describeTest(test: Pick<Doc<"creativeTests">, "title" | "createdAt" | "baseline" | "outcome">) {
  const outcome = test.outcome;
  if (!outcome || outcome.result === "notTried") return null;
  const days = Math.max(1, Math.round((outcome.recordedAt - test.createdAt) / DAY_MS));
  const measured = changesBetween(test.baseline, outcome.after)
    .map((row) => `${row.label} ${row.metric} ${row.percent > 0 ? "+" : ""}${row.percent}%`)
    .join(", ");
  const winner = outcome.winner
    ? ` Best variation: ${outcome.winner.key} (hook type: ${outcome.winner.hookType || "not stated"}; hook: "${outcome.winner.hook}"; headline: "${outcome.winner.headline}").`
    : " No variation stood out.";
  const note = outcome.note ? ` Owner: "${outcome.note}"` : "";
  return `"${test.title}" ran for ${days} ${days === 1 ? "day" : "days"}. Result: ${RESULT_WORDS[outcome.result]}${measured ? ` (${measured})` : ""}.${winner}${note}`;
}

/** For cp.context: what this brand's earlier ad sets showed, newest first. Only recorded outcomes. */
export async function testsForKit(ctx: QueryCtx, workspaceId: Id<"workspaces">, kitId: Id<"brandKits">) {
  const rows = await ctx.db
    .query("creativeTests")
    .withIndex("by_workspace_kit", (q) => q.eq("workspaceId", workspaceId).eq("kitId", kitId))
    .order("desc")
    .take(30);
  return rows
    .map(describeTest)
    .filter((line): line is string => line !== null)
    .slice(0, MAX_TESTS_IN_BRIEF);
}

/** Ad sets whose check-in is due: running past their date with no outcome yet, oldest first. */
export const due = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("creativeTests")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId).lte("checkInAt", now))
      .take(50);
    return rows
      .filter((row) => !row.outcome)
      .slice(0, 10)
      .map((row) => view(row, now));
  },
});

/**
 * "We're running this": records that an approved ad set went live, when to check back, and today's
 * figures. Only an approved set can be marked: nothing unreviewed is recorded as running. Owners and Managers.
 */
export const start = workspaceMutation({
  args: { assetId: v.id("assets"), checkInDays: v.number() },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    if (!CHECK_IN_DAYS.includes(args.checkInDays as (typeof CHECK_IN_DAYS)[number])) notAllowed();
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.workspaceId !== ctx.workspaceId || asset.kind !== "adCopySet") notFound();
    if (asset.status !== "approved") throw userError("Approve this ad set before you mark it as running.");
    const existing = await testOf(ctx, ctx.workspaceId, asset._id);
    if (existing) return existing._id;
    const saved = (await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null;
    const kitId = saved ? ctx.db.normalizeId("brandKits", saved.kit.id) : null;
    const kit = kitId ? await ctx.db.get(kitId) : null;
    if (!saved?.creative || !kit || kit.workspaceId !== ctx.workspaceId) notFound();
    const now = Date.now();
    const testId = await ctx.db.insert("creativeTests", {
      workspaceId: ctx.workspaceId,
      assetId: asset._id,
      kitId: kit._id,
      title: clip(asset.title, MAX_LINE),
      checkInAt: now + args.checkInDays * DAY_MS,
      createdBy: ctx.identity.subject,
      createdAt: now,
      baseline: await currentFigures(ctx, ctx.workspaceId),
    });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "creative.test_started", subject: testId });
    return testId;
  },
});

/** Moves a check-in date. Owners and Managers. */
export const reschedule = workspaceMutation({
  args: { testId: v.id("creativeTests"), checkInDays: v.number() },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    if (!CHECK_IN_DAYS.includes(args.checkInDays as (typeof CHECK_IN_DAYS)[number])) notAllowed();
    const test = await ownTest(ctx, ctx.workspaceId, args.testId);
    if (test.outcome) notAllowed();
    await ctx.db.patch(test._id, { checkInAt: Date.now() + args.checkInDays * DAY_MS });
    return null;
  },
});

/**
 * "What happened": the result, the variation that did best (if one did) and a note, with today's figures
 * beside the starting ones. The winner is read from the saved ad set, never from the screen.
 */
export const recordOutcome = workspaceMutation({
  args: { testId: v.id("creativeTests"), result: resultValidator, winnerKey: v.optional(v.string()), note: v.string() },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const test = await ownTest(ctx, ctx.workspaceId, args.testId);
    let winner: NonNullable<Doc<"creativeTests">["outcome"]>["winner"];
    if (args.winnerKey && args.result !== "notTried") {
      const asset = await ctx.db.get(test.assetId);
      const saved = asset && asset.workspaceId === ctx.workspaceId ? ((await savedRecord(ctx.db, asset, "creative")) as CreativeRecord | null) : null;
      const variation = saved?.creative?.variations.find((row) => row.key === args.winnerKey);
      if (!variation) throw userError("That variation is not in this ad set.");
      winner = { key: variation.key, hookType: clip(variation.hookType, MAX_LINE), hook: clip(variation.hook, MAX_LINE), headline: clip(variation.headline, MAX_LINE) };
    }
    const outcome = {
      result: args.result,
      ...(winner ? { winner } : {}),
      note: clip(args.note, MAX_NOTE),
      after: await currentFigures(ctx, ctx.workspaceId),
      recordedAt: Date.now(),
      recordedBy: ctx.identity.subject,
    };
    await ctx.db.patch(test._id, { outcome });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "creative.test_outcome", subject: `${test._id}:${args.result}` });
    return null;
  },
});

/** Removes the record that an ad set ran. Owners and Managers. */
export const remove = workspaceMutation({
  args: { testId: v.id("creativeTests") },
  handler: async (ctx, args) => {
    requireEditor(ctx.member.role);
    const test = await ownTest(ctx, ctx.workspaceId, args.testId);
    await ctx.db.delete(test._id);
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "creative.test_removed", subject: args.testId });
    return null;
  },
});
