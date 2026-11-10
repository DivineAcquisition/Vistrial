"use node";
/** Making one image with Gemini and storing it. Runs in Node because the picture is held in memory while it is decoded. */
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { GeminiError, callGeminiImage } from "./lib/gemini";

export const make = internalAction({
  args: { imageId: v.id("creativeImages") },
  handler: async (ctx, args): Promise<null> => {
    const plan = await ctx.runQuery(internal.creativeImages.forMake, { imageId: args.imageId });
    if (!plan) {
      await ctx.runMutation(internal.creativeImages.saveMade, { imageId: args.imageId, costCents: 0, failCode: "provider_error" });
      return null;
    }
    try {
      const image = await callGeminiImage(plan);
      const storageId = await ctx.storage.store(new Blob([Buffer.from(image.data, "base64")], { type: image.mimeType }));
      await ctx.runMutation(internal.creativeImages.saveMade, { imageId: args.imageId, storageId, costCents: image.costCents });
    } catch (error) {
      await ctx.runMutation(internal.creativeImages.saveMade, { imageId: args.imageId, costCents: 0, failCode: error instanceof GeminiError ? error.code : "provider_error" });
    }
    return null;
  },
});
