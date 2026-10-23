import { workspaceQuery } from "./lib/builders";

/** Live panel. Step 1 writes no rows. Kinds, ids, and counts only. */
export const recent = workspaceQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("events")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
      .order("desc")
      .take(20);
    return rows.map((row) => ({
      id: row._id,
      kind: row.kind,
      subjectId: row.subjectId ?? null,
      count: row.count ?? null,
      createdAt: row.createdAt,
    }));
  },
});
