"use node";
/**
 * Breaking a reference ad down into its structure. A public YouTube link is read by Gemini as a link; an
 * uploaded video is sent to Gemini as the bytes the person gave us; an uploaded image is read by Claude.
 * Runs in Node because a video is held in memory while it is encoded.
 */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { GeminiError, callGemini, videoModel, type GeminiPart } from "./lib/gemini";
import { ModelError, type ModelRoute } from "./lib/modelRouter";
import { BREAKDOWN_ASK, BREAKDOWN_SCHEMA, BREAKDOWN_SYSTEM, geminiVideoType, readBreakdown, type Breakdown } from "./lib/referenceShapes";
import { completeWithTools } from "./lib/toolRouter";

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const analyse = internalAction({
  args: { referenceId: v.id("creativeReferences") },
  handler: async (ctx, args): Promise<null> => {
    const state = await ctx.runQuery(internal.references.forAnalysis, { referenceId: args.referenceId });
    if (!state) return null;
    const { reference } = state;
    const done = (breakdown: Breakdown | null, costCents: number, failCode?: string) =>
      ctx.runMutation(internal.references.saveAnalysis, { referenceId: reference._id, costCents, ...(breakdown ? { breakdown } : { failCode: failCode ?? "unreadable" }) });

    try {
      if (reference.mediaKind === "image") {
        const route = state.route as ModelRoute | null;
        if (!route) return await done(null, 0, "no_route");
        const blob = reference.storageId ? await ctx.storage.get(reference.storageId) : null;
        if (!blob) return await done(null, 0, "file_missing");
        const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
        const result = await completeWithTools(route, "classify", {
          system: BREAKDOWN_SYSTEM,
          input: BREAKDOWN_ASK,
          attachments: [{ type: "image", source: { type: "base64", media_type: (reference.contentType ?? "image/png") as "image/png", data } }],
          outputSchema: BREAKDOWN_SCHEMA,
          maxTurns: 1,
        });
        return await done(readBreakdown(result.output), result.costCents);
      }

      let part: GeminiPart;
      if (reference.origin === "link" && reference.url) {
        part = { type: "video", uri: reference.url };
      } else {
        const blob = reference.storageId ? await ctx.storage.get(reference.storageId) : null;
        if (!blob) return await done(null, 0, "file_missing");
        part = { type: "video", data: Buffer.from(await blob.arrayBuffer()).toString("base64"), mime_type: geminiVideoType(reference.contentType ?? "video/mp4") };
      }
      const result = await callGemini({ model: videoModel(), system: BREAKDOWN_SYSTEM, parts: [{ type: "text", text: BREAKDOWN_ASK }, part], schema: BREAKDOWN_SCHEMA });
      return await done(readBreakdown(parse(result.text)), result.costCents);
    } catch (error) {
      if (error instanceof GeminiError) return await done(null, error.costCents, error.code);
      if (error instanceof ModelError) return await done(null, error.spent.costCents, error.code);
      return await done(null, 0, "provider_error");
    }
  },
});
