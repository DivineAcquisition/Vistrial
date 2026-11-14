"use node";
/**
 * The website step of a Playbook study: reads the public pages a person named, through the shared page
 * reader (robots.txt honoured, no logins, nothing worked around), as a plain request with no browser and no
 * screenshots. Only each page's text is kept, on the study, for the gather step to read.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { readPage, REASON_WORDS } from "./lib/pageReader/read";
import { liveReadEnv } from "./pageReadActions";

/** One page per call keeps every call far inside the action time limit; the run calls again for the next. */
export const readSite = internalAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<{ resultCode: string; resultId?: string; costCents: number }> => {
    const next: { studyId: string; index: number; url: string } | null = await ctx.runQuery(internal.playbookStudySite.nextPage, { runId: args.runId });
    if (!next) return { resultCode: "done", costCents: 0 };
    const result = await readPage(next.url, { ...liveReadEnv(ctx), renderer: null });
    const text = result.snapshot
      ? [result.snapshot.title, result.snapshot.description, ...result.snapshot.blocks.map((block) => ("text" in block ? block.text : block.kind === "image" ? (block.alt ?? "") : ""))]
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n")
      : "";
    const read = (result.state === "read" || result.state === "partial") && text.length > 0;
    await ctx.runMutation(internal.playbookStudySite.savePage, {
      runId: args.runId,
      index: next.index,
      ...(read ? { text } : { problem: REASON_WORDS[result.reasonCode] ?? "The page could not be read." }),
    });
    return { resultCode: read ? "read" : result.state, resultId: String(next.index), costCents: 0 };
  },
});
