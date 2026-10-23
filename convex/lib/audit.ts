import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Audit rows store ids, kinds, and counts. No message, transcript, email, or reason text.
 */
export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    workspaceId?: Id<"workspaces">;
    actorType: "user" | "staff" | "system";
    actorId: string;
    action: string;
    subject: string;
    count?: number;
  },
) {
  await ctx.db.insert("auditLog", {
    workspaceId: entry.workspaceId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    subject: entry.subject,
    count: entry.count,
    createdAt: Date.now(),
  });
}
