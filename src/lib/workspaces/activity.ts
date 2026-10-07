import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * Record something only the app observes (sign-in, sign-out, entering a
 * workspace). Everything that changes data is logged by the database itself.
 * Never throws: a lost log line must not block the person's request, so a
 * failure is reported to the server log instead.
 */
export async function logWorkspaceActivity(args: {
  actorUserId: string | null;
  orgId: string | null;
  action: string;
  targetTable?: string;
  targetId?: string;
  detail?: Record<string, Json | undefined>;
}): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().rpc("log_workspace_activity", {
      p_actor_user_id: args.actorUserId,
      p_org_id: args.orgId,
      p_action: args.action,
      p_target_table: args.targetTable ?? null,
      p_target_id: args.targetId ?? null,
      p_detail: (args.detail ?? {}) as Json,
    });
    if (error) console.error("[activity-log] write failed", args.action, error.message);
  } catch (error) {
    console.error("[activity-log] write failed", args.action, error);
  }
}
