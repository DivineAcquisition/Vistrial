import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DraftInputs } from "@/lib/foundation/draft";
import { FIELD_SOURCES, type FieldSource, type FieldValue, type FoundationState, type StoredField } from "@/lib/foundation/fields";

const DAY = 86_400_000;

export async function loadFoundation(db: SupabaseClient, orgId: string): Promise<FoundationState> {
  const [fields, version] = await Promise.all([
    db.from("foundation_fields").select("key, value, source, status").eq("org_id", orgId),
    db.from("foundation_versions").select("version, confirmed_at, note").eq("org_id", orgId).order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const map = new Map<string, StoredField>();
  for (const row of (fields.data ?? []) as Array<{ key: string; value: FieldValue; source: string; status: StoredField["status"] }>) {
    const source = (FIELD_SOURCES as readonly string[]).includes(row.source) ? (row.source as FieldSource) : "compass";
    map.set(row.key, { key: row.key, value: row.value, source, status: row.status });
  }
  const v = version.data as { version: number; confirmed_at: string; note: string } | null;
  return { fields: map, version: v ? { version: v.version, confirmedAt: v.confirmed_at, note: v.note } : null };
}

/**
 * The fields agents may act on: the latest confirmed version only. A field
 * edited after confirmation keeps its confirmed value here until the Owner
 * confirms again.
 */
export async function confirmedFoundation(db: SupabaseClient, orgId: string): Promise<Map<string, FieldValue>> {
  const { data } = await db
    .from("foundation_versions")
    .select("fields")
    .eq("org_id", orgId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fields = ((data as { fields?: Record<string, { value: FieldValue }> } | null)?.fields ?? {}) as Record<string, { value: FieldValue }>;
  return new Map(Object.entries(fields).map(([key, entry]) => [key, entry?.value ?? null]));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** What Compass drafts from. Counts and stage names only; no message or call text. */
export async function loadDraftInputs(db: SupabaseClient, orgId: string, now: number = Date.now()): Promise<DraftInputs> {
  const since90 = new Date(now - 90 * DAY).toISOString();
  const since365 = new Date(now - 365 * DAY).toISOString();
  const [profile, leads, revenue, blocks, config] = await Promise.all([
    db
      .from("business_profiles")
      .select("offer_name, offer_type, price_point_cents, sales_cycle_days, stated_close_rate_pct, pipeline_stage_meanings, goal_metric, goal_value, speed_to_lead_intent_minutes, channel_preference")
      .eq("org_id", orgId)
      .maybeSingle(),
    db.from("leads").select("pipeline_stage, status").eq("org_id", orgId).eq("is_test", false).is("merged_into", null).limit(5000),
    db.from("revenue_log").select("amount_cents").eq("org_id", orgId).gte("created_at", since365).gt("amount_cents", 0).limit(1000),
    db.from("calendar_blocks").select("lead_id, starts_at").eq("org_id", orgId).gte("starts_at", since90).not("lead_id", "is", null).limit(500),
    db.from("score_configs").select("speed_to_lead_minutes").eq("org_id", orgId).maybeSingle(),
  ]);

  const stageCounts = new Map<string, number>();
  let won = 0;
  let decided = 0;
  for (const row of (leads.data ?? []) as Array<{ pipeline_stage: string | null; status: string }>) {
    if (row.pipeline_stage) stageCounts.set(row.pipeline_stage, (stageCounts.get(row.pipeline_stage) ?? 0) + 1);
    if (row.status === "closed_won") won += 1;
    if (row.status === "closed_won" || row.status === "closed_lost") decided += 1;
  }

  const blockRows = (blocks.data ?? []) as Array<{ lead_id: string; starts_at: string }>;
  let medianDays: number | null = null;
  if (blockRows.length) {
    const { data: opted } = await db.from("leads").select("id, opted_in_at").eq("org_id", orgId).in("id", [...new Set(blockRows.map((row) => row.lead_id))].slice(0, 500));
    const optedAt = new Map(((opted ?? []) as Array<{ id: string; opted_in_at: string }>).map((row) => [row.id, Date.parse(row.opted_in_at)]));
    const days = blockRows.flatMap((row) => {
      const start = optedAt.get(row.lead_id);
      if (!start) return [];
      const diff = (Date.parse(row.starts_at) - start) / DAY;
      return diff >= 0 ? [Math.round(diff)] : [];
    });
    medianDays = median(days);
  }

  const p = profile.data as Record<string, unknown> | null;
  return {
    profile: p
      ? {
          offerName: (p.offer_name as string | null) ?? null,
          offerType: (p.offer_type as string | null) ?? null,
          pricePointCents: p.price_point_cents == null ? null : Number(p.price_point_cents),
          salesCycleDays: (p.sales_cycle_days as number | null) ?? null,
          statedCloseRatePct: p.stated_close_rate_pct == null ? null : Number(p.stated_close_rate_pct),
          stageMeanings: Array.isArray(p.pipeline_stage_meanings) ? (p.pipeline_stage_meanings as Array<{ crm_stage: string; means: string | null }>) : [],
          goalMetric: (p.goal_metric as string | null) ?? null,
          goalValue: p.goal_value == null ? null : Number(p.goal_value),
          speedToLeadMinutes: (p.speed_to_lead_intent_minutes as number | null) ?? null,
          channelPreference: (p.channel_preference as string | null) ?? null,
        }
      : null,
    crm: {
      stages: [...stageCounts.entries()].sort((a, b) => b[1] - a[1]).map(([stage, count]) => ({ stage, count })),
      won,
      decided,
      dealCents: ((revenue.data ?? []) as Array<{ amount_cents: number }>).map((row) => Number(row.amount_cents)),
    },
    calendar: { bookings90: blockRows.length, medianDaysToBooking: medianDays },
    responseMinutes: (config.data as { speed_to_lead_minutes?: number } | null)?.speed_to_lead_minutes ?? null,
  };
}
