import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ReportingPanel } from "@/lib/reporting/constants";
import type { ReportingRange } from "@/lib/reporting/range";
import type { Json } from "@/types/database";

export async function loadReportingPanel(
  orgId: string,
  panel: ReportingPanel,
  range: ReportingRange
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_reporting_panel", {
    p_org_id: orgId,
    p_panel: panel,
    p_from: range.from,
    p_to: range.to,
    p_range_key: range.key,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data as Record<string, unknown>;
}

export async function loadReportingState(orgId: string): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporting_org_state", { p_org_id: orgId });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? {}) as Record<string, unknown>;
}

export function asJson(value: unknown): Json {
  return value as Json;
}
