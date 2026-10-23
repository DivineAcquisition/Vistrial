import { v } from "convex/values";

import { mutation } from "./_generated/server";

/** Public site forms. No lead message body beyond what the person typed. */
export const capture = mutation({
  args: {
    kind: v.string(),
    email: v.string(),
    name: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase().slice(0, 200);
    if (!email.includes("@")) throw new Error("Enter an email.");
    await ctx.db.insert("publicRequests", {
      kind: args.kind.trim().slice(0, 40),
      email,
      name: args.name.trim().slice(0, 160),
      detail: args.detail.trim().slice(0, 4000),
      createdAt: Date.now(),
    });
    return null;
  },
});
