/**
 * The growth goal: what the owner wants, in their words, set first in the Diagnostics workspace. Code reads
 * a number, a measure and a period out of the words when they are there; nothing is guessed when they are
 * not. Growth Diagnostics reads the current goal and builds its 90-day roadmap toward it.
 */

import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { notAllowed, userError } from "./lib/errors";

export const MAX_GOAL = 200;

export type GoalPeriod = "week" | "month" | "quarter" | "year";

export type ReadGoal = { target?: number; metric?: string; period?: GoalPeriod };

const PERIODS: [RegExp, GoalPeriod][] = [
  [/\b(a|per|each|every|this|next|\/)\s*week\b|\bweekly\b/i, "week"],
  [/\b(a|per|each|every|this|next|\/)\s*month\b|\bmonthly\b|\bmo\b/i, "month"],
  [/\b(a|per|each|every|this|next|\/)\s*quarter\b|\bquarterly\b/i, "quarter"],
  [/\b(a|per|each|every|this|next|\/)\s*year\b|\byearly\b|\bannual(ly)?\b/i, "year"],
];

/** Plain words for the measure, from the word right after the number ("40 more bookings" → bookings). */
const FILLER = new Set(["more", "extra", "new", "additional", "x", "of", "in", "the", "retained", "paying", "qualified", "booked"]);

/** Reads "40 more bookings a month" as 40, bookings, month. Missing parts stay missing. */
export function readGoal(text: string): ReadGoal {
  const out: ReadGoal = {};
  const flat = text.replace(/\s+/g, " ").trim();
  const number = flat.match(/(?:[$£€])?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i);
  if (number) {
    const value = Number(number[1].replace(/,/g, "")) * (number[2] ? 1000 : 1);
    if (Number.isFinite(value) && value > 0) out.target = value;
    const after = flat.slice((number.index ?? 0) + number[0].length).toLowerCase().split(/[^a-z%-]+/).filter(Boolean);
    const word = after.find((row) => !FILLER.has(row));
    if (word && !/^(a|per|each|every|this|next)$/.test(word)) out.metric = /^[$£€]/.test(number[0].trim()) ? `${word} (money)` : word;
  }
  for (const [pattern, period] of PERIODS) {
    if (pattern.test(flat)) {
      out.period = period;
      break;
    }
  }
  return out;
}

export type GoalView = { id: Id<"growthGoals">; text: string; target: number | null; metric: string | null; period: GoalPeriod | null; setAt: number };

function view(row: Doc<"growthGoals">): GoalView {
  return { id: row._id, text: row.text, target: row.target ?? null, metric: row.metric ?? null, period: row.period ?? null, setAt: row.setAt };
}

/** The workspace's current goal, or null before one is set. */
export async function currentGoal(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("growthGoals")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .first();
}

export const get = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const row = await currentGoal(ctx, ctx.workspaceId);
    return row ? view(row) : null;
  },
});

/** Sets the goal. A change is a new row, so earlier goals stay readable. Owners and Managers. */
export const set = workspaceMutation({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const text = args.text.replace(/\s+/g, " ").trim().slice(0, MAX_GOAL);
    if (text.length < 3) throw userError("Say what you want to reach, for example \"40 more bookings a month\".");
    const current = await currentGoal(ctx, ctx.workspaceId);
    if (current?.text === text) return current._id;
    const read = readGoal(text);
    const id = await ctx.db.insert("growthGoals", { workspaceId: ctx.workspaceId, text, ...read, setBy: ctx.identity.subject, setAt: Date.now() });
    await writeAudit(ctx, { workspaceId: ctx.workspaceId, actorType: "user", actorId: ctx.identity.subject, action: "goal.set", subject: id });
    return id;
  },
});
