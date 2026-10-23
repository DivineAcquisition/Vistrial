import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { workspaceMutation, workspaceQuery } from "./lib/builders";
import { writeAudit } from "./lib/audit";
import { notAllowed, notFound } from "./lib/errors";

export const list = workspaceQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page =
      ctx.member.role === "rep"
        ? await ctx.db
            .query("leads")
            .withIndex("by_workspace_assignee", (q) =>
              q.eq("workspaceId", ctx.workspaceId).eq("assignedMemberId", ctx.member._id),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("leads")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.workspaceId))
            .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((lead) => ({
        id: lead._id,
        assignedMemberId: lead.assignedMemberId ?? null,
      })),
    };
  },
});

export const get = workspaceQuery({
  args: { leadId: v.id("leads") },
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== ctx.workspaceId) notFound();
    if (ctx.member.role === "rep" && lead.assignedMemberId !== ctx.member._id) notFound();
    return { id: lead._id, assignedMemberId: lead.assignedMemberId ?? null };
  },
});

export const assign = workspaceMutation({
  args: { leadId: v.id("leads"), assignedMemberId: v.id("members") },
  handler: async (ctx, args) => {
    if (ctx.member.role === "rep") notAllowed();
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== ctx.workspaceId) notFound();
    const assignee = await ctx.db.get(args.assignedMemberId);
    if (!assignee || assignee.workspaceId !== ctx.workspaceId || !assignee.active) notFound();
    await ctx.db.patch(lead._id, { assignedMemberId: assignee._id });
    await writeAudit(ctx, {
      workspaceId: ctx.workspaceId,
      actorType: "user",
      actorId: ctx.identity.subject,
      action: "lead.assigned",
      subject: lead._id,
    });
    return null;
  },
});
