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
    p_zero_human_touch: filters.zeroHumanTouch,
    p_ttft_breach: filters.ttftBreach,
  });

  if (error) {
    throw new Error(error.message || "Could not load case files.");
  }

  const payload = parseCaseListPayload(data);
  const { data: config } = await supabase
    .from("score_configs")
    .select("speed_to_lead_minutes")
    .eq("org_id", orgId)
    .maybeSingle();
  return {
    ...payload,
    speedToLeadMinutes: config?.speed_to_lead_minutes ?? payload.speedToLeadMinutes,
  };
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
  const payload = parseCaseFilePayload(data);
  if (!payload) return null;

  const [extraLead, files, transcripts, config] = await Promise.all([
    supabase
      .from("leads")
      .select("context_notes, pipeline_stage, created_at, time_to_first_human_touch_seconds")
      .eq("org_id", orgId)
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("lead_files")
      .select("id, file_name, content_type, byte_size, uploaded_by_member_id, created_at")
      .eq("org_id", orgId)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("calls")
      .select("id, raw_transcript")
      .eq("org_id", orgId)
      .eq("lead_id", leadId),
    supabase
      .from("score_configs")
      .select("speed_to_lead_minutes")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  const transcriptById = new Map(
    (transcripts.data ?? []).map((row) => [row.id, row] as const)
  );

  return {
    ...payload,
    lead: {
      ...payload.lead,
      contextNotes: extraLead.data?.context_notes ?? payload.lead.contextNotes,
      pipelineStage: extraLead.data?.pipeline_stage ?? payload.lead.pipelineStage,
      createdAt: extraLead.data?.created_at ?? payload.lead.createdAt,
      timeToFirstHumanTouchSeconds:
        extraLead.data?.time_to_first_human_touch_seconds ??
        payload.lead.timeToFirstHumanTouchSeconds,
      speedToLeadMinutes:
        config.data?.speed_to_lead_minutes ?? payload.lead.speedToLeadMinutes,
    },
    calls: payload.calls.map((call) => {
      const row = transcriptById.get(call.id);
      const raw = row?.raw_transcript?.trim() ?? "";
      return {
        ...call,
        transcript: raw.length > 0 ? raw : null,
        hasTranscript: call.hasTranscript || raw.length > 0,
      };
    }),
    files: (files.data ?? []).map((row) => ({
      id: row.id,
      fileName: row.file_name,
      contentType: row.content_type,
      byteSize: row.byte_size,
      uploadedByMemberId: row.uploaded_by_member_id,
      createdAt: row.created_at,
    })),
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
