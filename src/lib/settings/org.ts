import "server-only";

import type { AuthContext } from "@/lib/auth/types";
import { canWriteAdvancedSettings } from "@/lib/settings/managed";
import { createClient } from "@/lib/supabase/server";

export type OrgManagedRow = {
  managed: boolean;
  managedTakenOverAt: string | null;
  name: string;
};

export async function loadOrgManaged(orgId: string): Promise<OrgManagedRow> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("managed, managed_taken_over_at, name")
    .eq("id", orgId)
    .maybeSingle();
  return {
    managed: data?.managed ?? true,
    managedTakenOverAt: data?.managed_taken_over_at ?? null,
    name: data?.name ?? "",
  };
}

export async function loadAdvancedAccess(ctx: AuthContext): Promise<{
  managed: boolean;
  managedTakenOverAt: string | null;
  writable: boolean;
  orgName: string;
}> {
  const row = await loadOrgManaged(ctx.org.id);
  return {
    managed: row.managed,
    managedTakenOverAt: row.managedTakenOverAt,
    writable: canWriteAdvancedSettings(ctx, row.managed),
    orgName: row.name,
  };
}

export function advancedRpcDenied(message: string): string | null {
  const lower = message.toLowerCase();
  if (lower.includes("advanced settings are managed")) {
    return "These settings are managed by your install team. Take over management, or ask them to make the change.";
  }
  if (lower.includes("not authorized")) {
    return "You do not have permission to change that.";
  }
  return null;
}
