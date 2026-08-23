import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import type { CaseListCursor, CaseTimelineCursor } from "@/lib/cases/cursor";
import { parseCaseFilePayload, parseCaseListPayload, parseCaseTimelinePage } from "@/lib/cases/parse";
import {
  CASE_PAGE_SIZE,
  CASE_TIMELINE_PAGE_SIZE,
  type CaseFilePayload,
  type CaseListFilters,
  type CaseListPayload,
  type CaseTimelinePage,
} from "@/lib/cases/types";
import { createClient } from "@/lib/supabase/server";
import { coalesceOfferName } from "@/lib/profile/offer";
import type { Database, Json } from "@/types/database";

export async function loadOrgCaseList(
  filters: CaseListFilters,
  opts?: { cursor?: CaseListCursor | null; limit?: number }
): Promise<CaseListPayload> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  return fetchOrgCaseList(supabase, ctx.org.id, filters, opts);
}

export async function fetchOrgCaseList(
  supabase: SupabaseClient<Database>,
  orgId: string,
  filters: CaseListFilters,
  opts?: { cursor?: CaseListCursor | null; limit?: number }
): Promise<CaseListPayload> {
  const { data, error } = await supabase.rpc("load_org_case_list", {
    p_org_id: orgId,
    p_q: filters.q,
    p_status: filters.status,
    p_track: filters.track,
    p_source: filters.source,
    p_setter_id: filters.setterId,
    p_closer_id: filters.closerId,
    p_score_min: filters.scoreMin,
    p_score_max: filters.scoreMax,
    p_opted_from: filters.optedFrom,
    p_opted_to: filters.optedTo,
    p_sort: filters.sort,
    p_dir: filters.dir,
    p_cursor: (opts?.cursor ?? null) as Json | null,
    p_limit: opts?.limit ?? CASE_PAGE_SIZE,
  });

  if (error) {
    throw new Error(error.message || "Could not load case files.");
  }

  return parseCaseListPayload(data);
}

export async function loadOrgCaseFile(leadId: string): Promise<CaseFilePayload | null> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  return fetchOrgCaseFile(supabase, ctx.org.id, leadId);
}

export async function fetchOrgCaseFile(
  supabase: SupabaseClient<Database>,
  orgId: string,
  leadId: string
): Promise<CaseFilePayload | null> {
  const { data, error } = await supabase.rpc("load_org_case_file", {
    p_org_id: orgId,
    p_lead_id: leadId,
    p_timeline_limit: CASE_TIMELINE_PAGE_SIZE,
  });

  if (error) {
    throw new Error(error.message || "Could not load that case file.");
  }
  if (data == null) return null;
  const parsed = parseCaseFilePayload(data);
  if (!parsed) return null;
  if (parsed.lead.offerName) return parsed;

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("offer_name")
    .eq("org_id", orgId)
    .maybeSingle();
  return {
    ...parsed,
    lead: {
      ...parsed.lead,
      offerName: coalesceOfferName(parsed.lead.offerName, profile?.offer_name),
    },
  };
}

export async function fetchOrgCaseTimeline(
  supabase: SupabaseClient<Database>,
  orgId: string,
  leadId: string,
  cursor?: CaseTimelineCursor | null
): Promise<CaseTimelinePage | null> {
  const { data, error } = await supabase.rpc("load_org_case_timeline", {
    p_org_id: orgId,
    p_lead_id: leadId,
    p_cursor: (cursor ?? null) as Json | null,
    p_limit: CASE_TIMELINE_PAGE_SIZE,
  });

  if (error) {
    throw new Error(error.message || "Could not load the timeline.");
  }
  if (data == null) return null;
  return parseCaseTimelinePage(data);
}
