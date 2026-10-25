import { internalMutation } from "./_generated/server";
import { firstOpenStage, seedSpine } from "./lib/seedSpine";

/**
 * Copies Step 1 stub leads onto the spine.
 * Run this while the new fields are still optional. After every row has
 * ownerMemberId, personId, stageId, status, source, historic, and lastActivityAt,
 * a later deploy can require those fields and drop assignedMemberId.
 * lastActivityAt is the lead's createdAt, which is the only time the stub stored.
 */
export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const workspaces = await ctx.db.query("workspaces").take(50);
    let count = 0;
    for (const workspace of workspaces) {
      await seedSpine(ctx, workspace._id);
      const stage = await firstOpenStage(ctx, workspace._id);
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const page = await ctx.db
          .query("leads")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
          .paginate({ numItems: 50, cursor });
        for (const lead of page.page) {
          if (lead.ownerMemberId && lead.personId && lead.stageId && lead.lastActivityAt !== undefined) continue;
          const owner = lead.ownerMemberId ?? lead.assignedMemberId;
          if (!owner) continue;
          let personId = lead.personId;
          if (!personId) {
            personId = await ctx.db.insert("people", {
              workspaceId: workspace._id,
              displayName: "Unknown",
              normalizedName: "unknown",
              firstName: "",
              lastName: "",
              emailConsent: "unknown",
              textConsent: "unknown",
              callConsent: "unknown",
              consentSource: "manual",
              doNotContact: false,
              createdFromSource: "manual",
            });
          }
          await ctx.db.patch(lead._id, {
            ownerMemberId: owner,
            personId,
            stageId: lead.stageId ?? stage._id,
            source: lead.source ?? "manual",
            status: lead.status ?? "open",
            historic: lead.historic ?? true,
            lastActivityAt: lead.lastActivityAt ?? lead.createdAt,
          });
          count += 1;
        }
        done = page.isDone;
        cursor = page.continueCursor;
      }
    }
    return count;
  },
});
