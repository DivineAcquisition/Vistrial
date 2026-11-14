"use node";
/**
 * The reading step of a Playbook study, one source per call:
 * - a page of the business's own website, through the shared page reader (robots.txt honoured, no logins,
 *   nothing worked around), as a plain request with no browser and no screenshots;
 * - a public YouTube video, read by Gemini from its link, the way reference ads are (references.ts). The
 *   video is never downloaded or stored: only the words Gemini reports were said and shown are kept.
 * Only the text is kept, on the study, for the gather step to read.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { GeminiError, callGemini, videoModel } from "./lib/gemini";
import { readPage, REASON_WORDS } from "./lib/pageReader/read";
import { liveReadEnv } from "./pageReadActions";

const VIDEO_SYSTEM = [
  "You write down what a public sales training video says and shows, for a business to learn from.",
  "Write what the speakers say as closely to their own words as you can, in order, and any text shown on screen.",
  "Do not summarise, judge or add anything that is not in the video. If you cannot watch it, return empty text.",
].join(" ");
const VIDEO_ASK = "Write down what this video says and shows.";
const VIDEO_SCHEMA = { type: "object", properties: { text: { type: "string" } }, required: ["text"] };

/** What a person reads when a video could not be read. Never the provider's own message. */
const VIDEO_WORDS: Record<string, string> = {
  no_key: "Reading videos is not set up yet.",
  rate_limited: "The video reader is busy. Try again in a few minutes.",
  refused: "The video reader would not read this video.",
  blocked: "The video reader would not read this video.",
  bad_request: "This video could not be read. It may be private, age-restricted or not available.",
};

async function readVideo(url: string): Promise<{ text: string; costCents: number } | { problem: string; costCents: number }> {
  try {
    const result = await callGemini({ model: videoModel(), system: VIDEO_SYSTEM, parts: [{ type: "text", text: VIDEO_ASK }, { type: "video", uri: url }], schema: VIDEO_SCHEMA, maxOutputTokens: 8000 });
    let text = "";
    try {
      const value = JSON.parse(result.text) as { text?: unknown };
      text = typeof value.text === "string" ? value.text.trim() : "";
    } catch {
      text = "";
    }
    return text ? { text, costCents: result.costCents } : { problem: "The video reader found nothing it could write down.", costCents: result.costCents };
  } catch (error) {
    if (error instanceof GeminiError) return { problem: VIDEO_WORDS[error.code] ?? "This video could not be read.", costCents: error.costCents };
    return { problem: "This video could not be read.", costCents: 0 };
  }
}

async function readSitePage(ctx: Parameters<typeof liveReadEnv>[0], url: string): Promise<{ text: string } | { problem: string }> {
  const result = await readPage(url, { ...liveReadEnv(ctx), renderer: null });
  const text = result.snapshot
    ? [result.snapshot.title, result.snapshot.description, ...result.snapshot.blocks.map((block) => ("text" in block ? block.text : block.kind === "image" ? (block.alt ?? "") : ""))]
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n")
    : "";
  const read = (result.state === "read" || result.state === "partial") && text.length > 0;
  return read ? { text } : { problem: REASON_WORDS[result.reasonCode] ?? "The page could not be read." };
}

/** Reads the study's next page or video. One per call keeps every call far inside the action time limit. */
export const readNext = internalAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, args): Promise<{ resultCode: string; resultId?: string; costCents: number }> => {
    const next: { index: number; url: string; kind: "page" | "video" } | null = await ctx.runQuery(internal.playbookStudySite.nextPage, { runId: args.runId });
    if (!next) return { resultCode: "done", costCents: 0 };
    const outcome = next.kind === "video" ? await readVideo(next.url) : { ...(await readSitePage(ctx, next.url)), costCents: 0 };
    await ctx.runMutation(internal.playbookStudySite.savePage, { runId: args.runId, index: next.index, ...("text" in outcome ? { text: outcome.text } : { problem: outcome.problem }) });
    return { resultCode: "text" in outcome ? "read" : "unread", resultId: String(next.index), costCents: outcome.costCents };
  },
});
