import "server-only";

import type { StaffOrgRow } from "@/lib/onboarding/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseStaffOrgRow(value: unknown): StaffOrgRow | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = asString(row.id);
  const name = asString(row.name);
  const slug = asString(row.slug);
  const timezone = asString(row.timezone);
  const createdAt = asString(row.created_at);
  if (!id || !name || !slug || !timezone || !createdAt) return null;
  return {
    id,
    name,
    slug,
    timezone,
    activatedAt: asString(row.activated_at),
    createdAt,
    crmStatus: asString(row.crm_status),
    lastVerifiedAt: asString(row.last_verified_at),
    locationName: asString(row.location_name),
    backfillGrade: asString(row.backfill_grade),
    backfillStatus: asString(row.backfill_status),
    lastEventAt: asString(row.last_event_at),
    unprocessedEvents: asNumber(row.unprocessed_events),
    leadsSinceActivation: asNumber(row.leads_since_activation),
    activeMembers: asNumber(row.active_members),
    voiceExamples: typeof row.voice_examples === "number" ? row.voice_examples : null,
    transcriptChoice: asString(row.transcript_choice),
    fieldMapsSaved: row.field_maps_saved === true,
    ingestionBroken: row.ingestion_broken === true,
    ingestionPriority: asNumber(row.ingestion_priority),
    outcomePerHundred: typeof row.outcome_per_hundred === "number" ? row.outcome_per_hundred : null,
    outcomeTooSmall: typeof row.outcome_too_small === "boolean" ? row.outcome_too_small : null,
    outcomeMature: row.outcome_mature === true,
  };
}

export async function logStaffAccess(args: {
  action: string;
  orgId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_staff_access", {
    p_action: args.action,
    p_org_id: args.orgId ?? null,
    p_detail: (args.detail ?? {}) as Json,
  });
  if (error) throw new Error(error.message || "Could not record staff access.");
}

export async function loadStaffOrgOverview(): Promise<StaffOrgRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_org_overview");
  if (error) throw new Error(error.message || "Could not load client health.");
  if (!Array.isArray(data)) return [];
  return data.map(parseStaffOrgRow).filter((row): row is StaffOrgRow => row !== null);
}
