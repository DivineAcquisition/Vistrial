import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export async function loadCalibrationReport(orgId: string): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_calibration_report", { p_org_id: orgId });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Calibration report returned no payload.");
  }
  return data as Record<string, unknown>;
}

export async function previewScoreConfigChange(
  orgId: string,
  weights: {
    timeline: number;
    investment_capacity: number;
    decision_authority: number;
    pain_severity: number;
  },
  threshold: number
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_score_config_change", {
    p_org_id: orgId,
    p_timeline: weights.timeline,
    p_investment: weights.investment_capacity,
    p_authority: weights.decision_authority,
    p_pain: weights.pain_severity,
    p_threshold: threshold,
  });
  if (error) throw new Error(error.message);
  return (data ?? {}) as Record<string, unknown>;
}

export function asJson(value: unknown): Json {
  return value as Json;
}
