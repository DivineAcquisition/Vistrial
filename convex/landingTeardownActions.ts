"use node";
/**
 * The page reader as a step of a teardown run: each call reads the run's next page and reports a result code
 * and what the read cost. The run carries the cost under its own cap. Runs in Node for the same reason
 * pageReadActions does.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readAndSave } from "./pageReadActions";

export const readNext = internalAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<{ resultCode: string; resultId?: string; costCents: number }> => {
    const jobId = await ctx.runMutation(internal.landingTeardown.ensureJob, { runId: args.runId });
    if (!jobId) return { resultCode: "no_pages", costCents: 0 };
    const claimed = await ctx.runMutation(internal.pageReader.claimNext, { jobId });
    // Nothing left: claimNext has closed the job.
    if (!claimed) return { resultCode: "done", resultId: jobId, costCents: 0 };
    const state = await readAndSave(ctx, claimed.readId, claimed.url);
    const costCents = await ctx.runQuery(internal.landingTeardown.readCost, { readId: claimed.readId });
    return { resultCode: state, resultId: claimed.readId, costCents };
  },
});
