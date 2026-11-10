/**
 * Where onboarding ends: once the workspace pays for the plan, is granted credits by Vistrial, or billing is off on this deployment, the
 * free session and the paywall are behind it and the person moves on to the guided start.
 */
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { writeAudit } from "./audit";

/** Stages before paying. A workspace in one of these is still behind the paywall. */
export const LOCKED_STAGES = ["freeSession", "paywall"] as const;

export async function unlockOnboarding(ctx: MutationCtx, workspaceId: Id<"workspaces">, how: "plan" | "billingOff" | "grant") {
  const rows = await ctx.db
    .query("onboarding")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  for (const row of rows) {
    if (!(LOCKED_STAGES as readonly string[]).includes(row.stage)) continue;
    await ctx.db.patch(row._id, { stage: "guide", updatedAt: Date.now() });
    await writeAudit(ctx, {
      workspaceId,
      actorType: how === "billingOff" ? "user" : "system",
      actorId: how === "billingOff" ? row.userId : "billing",
      action: how === "plan" ? "onboarding.unlocked_by_plan" : how === "grant" ? "onboarding.unlocked_by_grant" : "onboarding.unlocked_billing_off",
      subject: row._id,
    });
  }
}
