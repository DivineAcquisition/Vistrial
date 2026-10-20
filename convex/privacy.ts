import { v } from "convex/values";

import { requireAccess } from "./access";
import { mutation } from "./_generated/server";

function scrub(value: unknown, names: string[]): { next: unknown; changed: boolean } {
  if (typeof value !== "string") return { next: value, changed: false };
  let next = value;
  let changed = false;
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length < 2) continue;
    if (next.includes(trimmed)) {
      next = next.split(trimmed).join("a lead");
      changed = true;
    }
  }
  return { next, changed };
}

/** A deletion request removes a lead's name from words that were copied as history. */
export const redactLead = mutation({
  args: {
    key: v.string(),
    job: v.string(),
    workspaceId: v.string(),
    leadId: v.string(),
    names: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "system", key: args.key, job: args.job, workspaceId: args.workspaceId });
    let changed = 0;
    const runs = await ctx.db
      .query("activityRuns")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
    for (const run of runs) {
      if (run.leadId !== args.leadId) continue;
      const label = scrub(run.subjectLabel, args.names);
      const row = scrub(JSON.stringify(run.row), args.names);
      if (label.changed || row.changed) {
        await ctx.db.patch(run._id, {
          subjectLabel: String(label.next),
          row: JSON.parse(String(row.next)),
        });
        changed += 1;
      }
    }
    const outputs = await ctx.db
      .query("activityOutputs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
    for (const output of outputs) {
      if (output.leadId !== args.leadId) continue;
      const row = scrub(JSON.stringify(output.row), args.names);
      if (row.changed) {
        await ctx.db.patch(output._id, { row: JSON.parse(String(row.next)) });
        changed += 1;
      }
    }
    const events = await ctx.db
      .query("activityEvents")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(500);
    for (const event of events) {
      if (event.leadId !== args.leadId) continue;
      const row = scrub(JSON.stringify(event.row), args.names);
      if (row.changed) {
        await ctx.db.patch(event._id, { row: JSON.parse(String(row.next)) });
        changed += 1;
      }
    }
    return { changed };
  },
});
