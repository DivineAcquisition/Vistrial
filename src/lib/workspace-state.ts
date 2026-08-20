import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

export type CrmSurfaceStatus = Enums<"ghl_connection_status"> | "missing";

export type CrmSurfaceState = {
  status: CrmSurfaceStatus;
  locationLinked: boolean;
  setupError: string | null;
};

export async function loadCrmSurfaceState(): Promise<CrmSurfaceState> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ghl_connections")
    .select("status, last_setup_error")
    .eq("org_id", ctx.org.id)
    .maybeSingle();

  return {
    status: data?.status ?? (ctx.org.ghlLocationId ? "active" : "missing"),
    locationLinked: Boolean(ctx.org.ghlLocationId || data?.status === "active" || data?.status === "broken"),
    setupError: data?.last_setup_error ?? null,
  };
}

export function crmIsConfigured(state: CrmSurfaceState): boolean {
  return state.status === "active" || state.status === "broken" || state.locationLinked;
}
