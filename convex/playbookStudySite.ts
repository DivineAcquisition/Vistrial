/**
 * The database side of a Playbook study's website step: which page to read next, and saving what it read.
 * Internal only; the action in playbookStudyActions.ts calls these.
 */
import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { studyOf } from "./skills/playbookStudy/tools";
import { STUDY_LIMITS } from "./skills/playbookStudy/shapes";

/** The next website page or video of the run's study that has not been tried yet, or null when all have. */
export const nextPage = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const study = await studyOf(ctx.db, run);
    if (!study) return null;
    const index = study.sources.findIndex((row) => (row.type === "website" || row.type === "video") && row.text === undefined && row.problem === undefined);
    if (index < 0) return null;
    const source = study.sources[index];
    return { studyId: study._id, index, url: source.ref ?? "", kind: source.type === "video" ? ("video" as const) : ("page" as const) };
  },
});

/** Saves one page's or video's text, or why it could not be read, on the study. */
export const savePage = internalMutation({
  args: { runId: v.id("agentRuns"), index: v.number(), text: v.optional(v.string()), problem: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const study = await studyOf(ctx.db, run);
    const kind = study?.sources[args.index]?.type;
    if (!study || (kind !== "website" && kind !== "video")) return null;
    const sources = study.sources.map((row, index) =>
      index === args.index ? { ...row, ...(args.text !== undefined ? { text: args.text.slice(0, STUDY_LIMITS.pastedChars) } : { problem: (args.problem ?? "The page could not be read.").slice(0, 200) }) } : row,
    );
    await ctx.db.patch(study._id, { sources });
    return null;
  },
});
