import { v } from "convex/values";

import { denied, requireAccess } from "./access";
import { mutation } from "./_generated/server";
import { upsertAssignment, upsertInvite, upsertMember, upsertStaff, upsertWorkspace } from "./rows";

/**
 * One-time and replica catch-up writes. Not callable from a signed-in person.
 * The import key is the system principal; a user token is denied.
 */
export const importBatch = mutation({
  args: {
    key: v.string(),
    workspaces: v.array(v.any()),
    members: v.array(v.any()),
    assignments: v.array(v.any()),
    invites: v.array(v.any()),
    staff: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "import", key: args.key });
    let workspaces = 0;
    let members = 0;
    let assignments = 0;
    let invites = 0;
    let staff = 0;
    for (const row of args.workspaces) {
      await upsertWorkspace(ctx, row as Record<string, unknown>);
      workspaces += 1;
    }
    for (const row of args.members) {
      await upsertMember(ctx, row as Record<string, unknown>);
      members += 1;
    }
    for (const row of args.assignments) {
      await upsertAssignment(ctx, row as Record<string, unknown>);
      assignments += 1;
    }
    for (const row of args.invites) {
      await upsertInvite(ctx, row as Record<string, unknown>);
      invites += 1;
    }
    for (const row of args.staff) {
      await upsertStaff(ctx, row as Record<string, unknown>);
      staff += 1;
    }
    return { workspaces, members, assignments, invites, staff };
  },
});

export const systemPatchMember = mutation({
  args: { key: v.string(), workspaceId: v.string(), legacyId: v.string(), fields: v.any() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "import", key: args.key });
    const existing = await ctx.db
      .query("members")
      .withIndex("by_legacyId", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (!existing || existing.workspaceId !== args.workspaceId) denied();
    const next = { ...(existing.row as Record<string, unknown>), ...(args.fields as Record<string, unknown>) };
    return (await upsertMember(ctx, next)).row;
  },
});

export const counts = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await requireAccess(ctx, { scope: "import", key: args.key });
    const workspaces = (await ctx.db.query("workspaces").take(5000)).length;
    const members = (await ctx.db.query("members").take(5000)).length;
    const assignments = (await ctx.db.query("assignments").take(5000)).length;
    const invites = (await ctx.db.query("invites").take(5000)).length;
    const staff = (await ctx.db.query("platformStaff").take(5000)).length;
    return { workspaces, members, assignments, invites, staff };
  },
});
