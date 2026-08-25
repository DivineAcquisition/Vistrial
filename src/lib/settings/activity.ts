import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import type { SettingsActorKind, SettingsSection } from "@/lib/settings/constants";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export async function logSettingsActivity(input: {
  ctx: AuthContext;
  orgId?: string;
  section: SettingsSection;
  action: string;
  from?: unknown;
  to?: unknown;
  actorKind?: SettingsActorKind;
  actorLabel?: string;
}): Promise<void> {
  const supabase = await createClient();
  const orgId = input.orgId ?? input.ctx.org.id;
  const da = input.ctx.isPlatformAdmin;
  const { error } = await supabase.rpc("log_settings_activity", {
    p_org_id: orgId,
    p_section: input.section,
    p_action: input.action,
    p_from: (input.from ?? null) as Json,
    p_to: (input.to ?? null) as Json,
    p_actor_label:
      input.actorLabel ??
      (da ? `${input.ctx.member.displayName} (DA)` : input.ctx.member.displayName),
    p_actor_kind: input.actorKind ?? (da ? "da_operator" : "member"),
    p_actor_member_id: input.ctx.member.orgId === orgId ? input.ctx.member.id : null,
    p_actor_user_id: input.ctx.user.id,
  });
  if (error) {
    // A missed log is a defect in the audit trail, not a reason to roll back the save.
    console.error("settings_activity_write_failed", error.message);
  }
}

export function managerDeniedMessage(): string {
  return "You do not have permission to change that.";
}

export function canManageSettings(ctx: AuthContext): boolean {
  return canManageOrgSettings(ctx.role, ctx.isPlatformAdmin);
}
