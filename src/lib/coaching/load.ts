import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function loadCallQualityRepSnapshotForOrg(
  orgId: string,
  args?: {
    memberId?: string | null;
    query?: string | null;
    includeTeam?: boolean;
  }
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_call_quality_rep_snapshot", {
    p_org_id: orgId,
    p_member_id: args?.memberId ?? null,
    p_query: args?.query ?? null,
    p_include_team: args?.includeTeam ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

export async function loadCallQualityManagerSnapshot(
  orgId: string
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_call_quality_manager_snapshot", {
    p_org_id: orgId,
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

export async function loadCallQualityForCall(callId: string): Promise<{
  measure: Record<string, unknown> | null;
  handlings: Array<Record<string, unknown>>;
}> {
  const supabase = await createClient();
  const { data: measure } = await supabase
    .from("call_quality_measures")
    .select("*")
    .eq("call_id", callId)
    .maybeSingle();
  const { data: handlings } = await supabase
    .from("call_objection_handlings")
    .select("objection_type, handling, verbatim, evidence_span")
    .eq("call_id", callId);
  return {
    measure: measure ? (measure as Record<string, unknown>) : null,
    handlings: (handlings ?? []) as Array<Record<string, unknown>>,
  };
}
