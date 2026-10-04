import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Enums, Json } from "@/types/database";

export type SalesDb = SupabaseClient<Database>;

/** PostgREST returns at most 1,000 rows a request. Analysis pages past that up to this cap and says when it stopped. */
export const ROW_CAP = 20000;
const PAGE = 1000;

export type Paged<T> = { rows: T[]; capped: boolean };

type RangeQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

async function pageAll<T>(build: () => RangeQuery<T>, cap = ROW_CAP): Promise<Paged<T>> {
  const rows: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await build().range(from, Math.min(from + PAGE, cap) - 1);
    if (error) throw new Error(`Could not read workspace data: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) return { rows, capped: false };
  }
  return { rows, capped: true };
}

export type Window = { from: string; to: string };

export function windowDays(days: number, now = new Date()): Window {
  const to = now.toISOString();
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  return { from, to };
}

export function priorWindow(window: Window): Window {
  const span = new Date(window.to).getTime() - new Date(window.from).getTime();
  return {
    from: new Date(new Date(window.from).getTime() - span).toISOString(),
    to: window.from,
  };
}

export type LeadRow = {
  id: string;
  source: string | null;
  campaign: string | null;
  status: Enums<"lead_status">;
  opted_in_at: string;
  first_human_touch_at: string | null;
  time_to_first_human_touch_seconds: number | null;
  has_net_close: boolean;
};

export async function loadLeads(db: SalesDb, orgId: string, window: Window): Promise<Paged<LeadRow>> {
  return pageAll<LeadRow>(() =>
    db
      .from("leads")
      .select(
        "id, source, campaign, status, opted_in_at, first_human_touch_at, time_to_first_human_touch_seconds, has_net_close"
      )
      .eq("org_id", orgId)
      .eq("is_test", false)
      .gte("opted_in_at", window.from)
      .lt("opted_in_at", window.to)
      .order("opted_in_at", { ascending: true }) as unknown as RangeQuery<LeadRow>
  );
}

export type CallRow = {
  id: string;
  lead_id: string;
  type: Enums<"call_type">;
  outcome: Enums<"call_outcome"> | null;
  occurred_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  ran_by_member_id: string | null;
  has_transcript: boolean;
};

export async function loadCalls(db: SalesDb, orgId: string, window: Window): Promise<Paged<CallRow>> {
  const paged = await pageAll<{
    id: string;
    lead_id: string;
    type: Enums<"call_type">;
    outcome: Enums<"call_outcome"> | null;
    occurred_at: string | null;
    scheduled_at: string | null;
    created_at: string;
    ran_by_member_id: string | null;
    transcript_arrived_at: string | null;
  }>(() =>
    db
      .from("calls")
      .select("id, lead_id, type, outcome, occurred_at, scheduled_at, created_at, ran_by_member_id, transcript_arrived_at")
      .eq("org_id", orgId)
      .gte("created_at", window.from)
      .lt("created_at", window.to)
      .order("created_at", { ascending: true }) as unknown as RangeQuery<never>
  );
  return {
    capped: paged.capped,
    rows: paged.rows.map((row) => ({
      id: row.id,
      lead_id: row.lead_id,
      type: row.type,
      outcome: row.outcome,
      occurred_at: row.occurred_at,
      scheduled_at: row.scheduled_at,
      created_at: row.created_at,
      ran_by_member_id: row.ran_by_member_id,
      has_transcript: Boolean(row.transcript_arrived_at),
    })),
  };
}

export type ObjectionRow = {
  id: string;
  lead_id: string;
  call_id: string | null;
  type: Enums<"objection_type">;
  verbatim: string;
  resolved: boolean;
  created_at: string;
};

export async function loadObjections(db: SalesDb, orgId: string, window: Window): Promise<Paged<ObjectionRow>> {
  return pageAll<ObjectionRow>(() =>
    db
      .from("objections")
      .select("id, lead_id, call_id, type, verbatim, resolved, created_at")
      .eq("org_id", orgId)
      .gte("created_at", window.from)
      .lt("created_at", window.to)
      .order("created_at", { ascending: true }) as unknown as RangeQuery<ObjectionRow>
  );
}

export type StatusChangeRow = {
  lead_id: string;
  from_status: Enums<"lead_status">;
  to_status: Enums<"lead_status">;
  note: string | null;
  created_at: string;
};

export async function loadStatusChanges(db: SalesDb, orgId: string, window: Window): Promise<Paged<StatusChangeRow>> {
  return pageAll<StatusChangeRow>(() =>
    db
      .from("lead_status_changes")
      .select("lead_id, from_status, to_status, note, created_at")
      .eq("org_id", orgId)
      .gte("created_at", window.from)
      .lt("created_at", window.to)
      .order("created_at", { ascending: true }) as unknown as RangeQuery<StatusChangeRow>
  );
}

export type TouchRow = {
  lead_id: string;
  channel: Enums<"touch_channel">;
  direction: Enums<"touch_direction">;
  type: Enums<"touch_type">;
  outcome: Enums<"touch_outcome"> | null;
  occurred_at: string;
};

export async function loadTouches(db: SalesDb, orgId: string, window: Window): Promise<Paged<TouchRow>> {
  return pageAll<TouchRow>(() =>
    db
      .from("touches")
      .select("lead_id, channel, direction, type, outcome, occurred_at")
      .eq("org_id", orgId)
      .gte("occurred_at", window.from)
      .lt("occurred_at", window.to)
      .order("occurred_at", { ascending: true }) as unknown as RangeQuery<TouchRow>
  );
}

export type DisqualificationRow = { lead_id: string; reason: string; created_at: string };

const DQ_PREFIX = "Disqualified on intake:";

export async function loadDisqualifications(
  db: SalesDb,
  orgId: string,
  window: Window
): Promise<Paged<DisqualificationRow>> {
  const paged = await pageAll<{ lead_id: string; action_text: string; created_at: string }>(() =>
    db
      .from("next_actions")
      .select("lead_id, action_text, created_at")
      .eq("org_id", orgId)
      .like("action_text", `${DQ_PREFIX}%`)
      .gte("created_at", window.from)
      .lt("created_at", window.to) as unknown as RangeQuery<never>
  );
  return {
    capped: paged.capped,
    rows: paged.rows.map((row) => ({
      lead_id: row.lead_id,
      reason: row.action_text.slice(DQ_PREFIX.length).replace(/Confirm before booking a call\.?$/, "").trim(),
      created_at: row.created_at,
    })),
  };
}

export type RevenueRow = { lead_id: string | null; amount_cents: number; kind: Enums<"revenue_kind">; occurred_at: string };

/** Revenue is owner/admin only under RLS. Callers pass whether the person may read it, so "none" and "hidden" never blur. */
export async function loadRevenue(
  db: SalesDb,
  orgId: string,
  window: Window,
  canRead: boolean
): Promise<{ visible: false } | ({ visible: true } & Paged<RevenueRow>)> {
  if (!canRead) return { visible: false };
  const paged = await pageAll<RevenueRow>(() =>
    db
      .from("revenue_log")
      .select("lead_id, amount_cents, kind, occurred_at")
      .eq("org_id", orgId)
      .gte("occurred_at", window.from)
      .lt("occurred_at", window.to) as unknown as RangeQuery<RevenueRow>
  );
  return { visible: true, ...paged };
}

export type SpendRow = { platform: string; spend_cents: number; spend_date: string; platform_leads: number | null };

export async function loadSpend(
  db: SalesDb,
  orgId: string,
  window: Window,
  canRead: boolean
): Promise<{ visible: false } | ({ visible: true } & Paged<SpendRow>)> {
  if (!canRead) return { visible: false };
  const paged = await pageAll<SpendRow>(() =>
    db
      .from("ad_spend_days")
      .select("platform, spend_cents, spend_date, platform_leads")
      .eq("org_id", orgId)
      .gte("spend_date", window.from.slice(0, 10))
      .lt("spend_date", window.to.slice(0, 10)) as unknown as RangeQuery<SpendRow>
  );
  return { visible: true, ...paged };
}

export type ProfileTargets = {
  monthlyLeadTarget: number | null;
  statedMonthlyVolume: number | null;
  responseTargetMinutes: number | null;
  statedCloseRatePct: number | null;
  offerName: string | null;
  salesCycleDays: number | null;
};

export async function loadTargets(db: SalesDb, orgId: string): Promise<ProfileTargets> {
  const [{ data: profile }, { data: org }] = await Promise.all([
    db
      .from("business_profiles")
      .select("monthly_lead_target, monthly_lead_volume, speed_to_lead_intent_minutes, stated_close_rate_pct, offer_name, sales_cycle_days")
      .eq("org_id", orgId)
      .maybeSingle(),
    db.from("organizations").select("sales_cycle_days").eq("id", orgId).maybeSingle(),
  ]);
  return {
    monthlyLeadTarget: profile?.monthly_lead_target ?? null,
    statedMonthlyVolume: profile?.monthly_lead_volume ?? null,
    responseTargetMinutes: profile?.speed_to_lead_intent_minutes ?? null,
    statedCloseRatePct: profile?.stated_close_rate_pct ?? null,
    offerName: profile?.offer_name ?? null,
    salesCycleDays: profile?.sales_cycle_days ?? org?.sales_cycle_days ?? null,
  };
}

export type TranscriptCall = {
  id: string;
  lead_id: string;
  type: Enums<"call_type">;
  occurred_at: string | null;
  transcript: string;
  summary: string | null;
  quotes: Array<{ text: string; topic: string }>;
};

function parseQuotes(value: Json | null | undefined): Array<{ text: string; topic: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const rec = item as Record<string, unknown>;
    const text = typeof rec.text === "string" ? rec.text.trim() : "";
    const topic = typeof rec.topic === "string" ? rec.topic.trim() : "situation";
    return text ? [{ text, topic }] : [];
  });
}

/** Held calls with transcripts for a set of leads. Transcripts are heavy, so callers ask for the leads they need. */
export async function loadTranscriptCalls(
  db: SalesDb,
  orgId: string,
  leadIds: readonly string[],
  limit: number
): Promise<TranscriptCall[]> {
  if (leadIds.length === 0) return [];
  const out: TranscriptCall[] = [];
  for (let i = 0; i < leadIds.length && out.length < limit; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const { data, error } = await db
      .from("calls")
      .select("id, lead_id, type, occurred_at, raw_transcript")
      .eq("org_id", orgId)
      .in("lead_id", chunk)
      .not("raw_transcript", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(limit - out.length);
    if (error) throw new Error(`Could not read call transcripts: ${error.message}`);
    for (const row of data ?? []) {
      if (!row.raw_transcript) continue;
      out.push({
        id: row.id,
        lead_id: row.lead_id,
        type: row.type,
        occurred_at: row.occurred_at,
        transcript: row.raw_transcript,
        summary: null,
        quotes: [],
      });
    }
  }
  if (out.length === 0) return out;
  const { data: extractions } = await db
    .from("call_extractions")
    .select("call_id, summary, quotes")
    .eq("org_id", orgId)
    .in(
      "call_id",
      out.map((call) => call.id)
    );
  const byCall = new Map((extractions ?? []).map((row) => [row.call_id, row]));
  return out.map((call) => {
    const extraction = byCall.get(call.id);
    return extraction ? { ...call, summary: extraction.summary, quotes: parseQuotes(extraction.quotes) } : call;
  });
}

export type ProspectQuote = { text: string; topic: string; callId: string; leadId: string };

export async function loadProspectQuotes(db: SalesDb, orgId: string, window: Window): Promise<Paged<ProspectQuote>> {
  const paged = await pageAll<{ call_id: string; quotes: Json; created_at: string }>(() =>
    db
      .from("call_extractions")
      .select("call_id, quotes, created_at")
      .eq("org_id", orgId)
      .gte("created_at", window.from)
      .lt("created_at", window.to) as unknown as RangeQuery<never>
  );
  const callIds = paged.rows.map((row) => row.call_id);
  const leadByCall = new Map<string, string>();
  for (let i = 0; i < callIds.length; i += 300) {
    const { data } = await db
      .from("calls")
      .select("id, lead_id")
      .eq("org_id", orgId)
      .in("id", callIds.slice(i, i + 300));
    for (const row of data ?? []) leadByCall.set(row.id, row.lead_id);
  }
  return {
    capped: paged.capped,
    rows: paged.rows.flatMap((row) =>
      parseQuotes(row.quotes).map((quote) => ({
        ...quote,
        callId: row.call_id,
        leadId: leadByCall.get(row.call_id) ?? "",
      }))
    ),
  };
}

export type HandlingRow = {
  call_id: string;
  objection_type: string;
  verbatim: string;
  handling: string;
  evidence_span: string | null;
};

/** Visible rows follow call-quality RLS: a rep sees their own calls, a manager sees the team. */
export async function loadObjectionHandlings(db: SalesDb, orgId: string, callIds: readonly string[]): Promise<HandlingRow[]> {
  const out: HandlingRow[] = [];
  for (let i = 0; i < callIds.length; i += 300) {
    const { data, error } = await db
      .from("call_objection_handlings")
      .select("call_id, objection_type, verbatim, handling, evidence_span")
      .eq("org_id", orgId)
      .in("call_id", callIds.slice(i, i + 300));
    if (error) throw new Error(`Could not read how objections were handled: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}
