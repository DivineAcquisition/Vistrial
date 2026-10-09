import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import {
  mapExperienceRow,
  toRpcFilter,
  type ExperienceFilter,
  type ExperienceRow,
  type ListSettings,
} from "@/lib/cases/experience";
import { createClient } from "@/lib/supabase/server";

type Loose = SupabaseClient;

export type ExperiencePage = {
  rows: ExperienceRow[];
  hasMore: boolean;
  settings: ListSettings;
  counts: Record<string, number>;
  sources: string[];
};

const EMPTY_SETTINGS: ListSettings = { windowMinutes: 15, timezone: "America/New_York", bands: [], facts: [] };

export async function loadExperiencePage(filter: ExperienceFilter, offset = 0): Promise<ExperiencePage> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as Loose;
  const [settings, counts, sources] = await Promise.all([
    db.rpc("case_list_settings", { p_org_id: ctx.org.id }),
    db.rpc("case_view_counts", { p_org_id: ctx.org.id, p_window: 15 }),
    db.from("leads").select("source").eq("org_id", ctx.org.id).not("source", "is", null).limit(200),
  ]);
  const parsed = parseSettings(settings.data);
  const listed = await db.rpc("load_case_experience", {
    p_org_id: ctx.org.id,
    p_filter: toRpcFilter(filter, parsed.windowMinutes, ctx.member.id, offset),
    p_limit: 50,
  });
  if (listed.error) throw new Error(listed.error.message);
  const body = (listed.data ?? {}) as { rows?: Array<Record<string, unknown>>; hasMore?: boolean };
  const uniqueSources = [...new Set(((sources.data ?? []) as Array<{ source: string | null }>).map((row) => row.source).filter((s): s is string => !!s))].sort();
  return {
    rows: (body.rows ?? []).map(mapExperienceRow),
    hasMore: body.hasMore === true,
    settings: parsed,
    counts: (counts.data ?? {}) as Record<string, number>,
    sources: uniqueSources,
  };
}

function parseSettings(data: unknown): ListSettings {
  if (!data || typeof data !== "object") return EMPTY_SETTINGS;
  const row = data as Record<string, unknown>;
  const bands = Array.isArray(row.bands)
    ? row.bands
        .filter((band): band is Record<string, unknown> => !!band && typeof band === "object")
        .map((band) => ({ name: String(band.name ?? ""), min_score: Number(band.min_score) }))
        .filter((band) => band.name)
    : [];
  const facts = Array.isArray(row.facts)
    ? row.facts
        .filter((fact): fact is Record<string, unknown> => !!fact && typeof fact === "object")
        .map((fact) => ({ key: String(fact.key ?? ""), label: String(fact.label ?? fact.key ?? "") }))
        .filter((fact) => fact.key)
    : [];
  return {
    windowMinutes: Number(row.windowMinutes) || 15,
    timezone: String(row.timezone || "America/New_York"),
    bands,
    facts,
  };
}

export async function loadCaseActivity(orgId: string, leadId: string, staff: boolean) {
  const db = (await createClient()) as unknown as Loose;
  let query = db
    .from("workspace_activity_log")
    .select("id, action, actor_label, actor_kind, created_at")
    .eq("org_id", orgId)
    .eq("target_id", leadId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!staff) query = query.neq("actor_kind", "service_team").neq("actor_kind", "platform_admin");
  const { data } = await query;
  return (data ?? []) as Array<{ id: string; action: string; actor_label: string | null; actor_kind: string; created_at: string }>;
}
