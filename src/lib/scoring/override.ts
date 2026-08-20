"use server";

import { getAuthContext } from "@/lib/auth/session";
import { canOverrideLead } from "@/lib/auth/permissions";
import { revalidateLeadSurfaces } from "@/lib/leads/revalidate";
import { computeReadinessScore, type FactorValues } from "@/lib/scoring/compute";
import { insertScoreRow, loadScoreConfig } from "@/lib/scoring/store";
import { createClient } from "@/lib/supabase/server";

export type OverrideScoreResult =
  | { ok: true; total: number }
  | { ok: false; error: string };

function parseFactor(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    return Number.NaN;
  }
  return parsed;
}

export async function overrideLeadScore(formData: FormData): Promise<OverrideScoreResult> {
  const ctx = await getAuthContext();
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const reasoning = String(formData.get("reasoning") ?? "").trim();

  if (!leadId) return { ok: false, error: "Pick a lead." };
  if (!reasoning) {
    return { ok: false, error: "Explain the override. Unexplained changes look like mistakes later." };
  }

  const factors: FactorValues = {
    timeline: parseFactor(formData.get("timeline")),
    investment_capacity: parseFactor(formData.get("investment_capacity")),
    decision_authority: parseFactor(formData.get("decision_authority")),
    pain_severity: parseFactor(formData.get("pain_severity")),
  };

  if (
    Number.isNaN(factors.timeline) ||
    Number.isNaN(factors.investment_capacity) ||
    Number.isNaN(factors.decision_authority) ||
    Number.isNaN(factors.pain_severity)
  ) {
    return { ok: false, error: "Each factor must be an integer from 0 to 100, or left blank if unknown." };
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, org_id, assigned_setter_id, assigned_closer_id")
    .eq("id", leadId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();

  if (leadError || !lead) {
    return { ok: false, error: "That lead is not in this workspace." };
  }

  if (
    !canOverrideLead({
      role: ctx.role,
      memberId: ctx.member.id,
      assignedSetterId: lead.assigned_setter_id,
      assignedCloserId: lead.assigned_closer_id,
      isPlatformAdmin: ctx.isPlatformAdmin,
    })
  ) {
    return { ok: false, error: "You can only override leads assigned to you." };
  }

  const config = await loadScoreConfig(supabase, ctx.org.id);
  const computed = computeReadinessScore(factors, config.weights);
  if (computed.kind === "unscored") {
    return { ok: false, error: "Set at least one factor. The total is computed from the factors, not typed in." };
  }

  const result = await insertScoreRow(supabase, {
    orgId: ctx.org.id,
    leadId: lead.id,
    factors: computed.factors,
    total: computed.total,
    reasoning: `Manual override by ${ctx.member.displayName}: ${reasoning} ${computed.explanation} A later call extraction will re-score this lead; this override is not a freeze.`,
    triggeredBy: "manual",
    scoredByMemberId: ctx.member.id,
  });

  if (!result.written) {
    return { ok: false, error: "Could not save the override." };
  }

  revalidateLeadSurfaces(lead.id);
  return { ok: true, total: computed.total };
}
