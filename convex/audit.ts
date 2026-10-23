import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    workspaceId?: Id<"workspaces">;
    actorType: "user" | "staff" | "system";
    actorId: string;
    action: string;
    subject: string;
    detail?: Record<string, string>;
  },
) {
  await ctx.db.insert("auditLog", {
    workspaceId: entry.workspaceId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    subject: entry.subject,
    detail: entry.detail ?? {},
    createdAt: Date.now(),
  });
}
