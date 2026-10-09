import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CaseFieldView, ScribeCaseFileView } from "@/lib/scribe/view";
import { createClient } from "@/lib/supabase/server";

/**
 * The lead's case file, read with the person's own client so workspace and
 * operator lead scope come from RLS. Null when Scribe has not built one yet
 * or the person cannot see it.
 */
export async function loadScribeCaseFile(orgId: string, leadId: string): Promise<ScribeCaseFileView | null> {
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: file } = await db
    .from("case_files")
    .select(
      "id, lead_id, status, summary, next_step, readiness_reason, score, band, band_meaning, open_questions, review_reasons, held_reason, version, last_call_id, last_run_id, built_at"
    )
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (!file) return null;

  const { data: rows } = await db
    .from("case_file_fields")
    .select("field_key, label, value, state, quote, passage_ids, source, locked, edited_at, scribe_value, review_note")
    .eq("org_id", orgId)
    .eq("case_file_id", file.id)
    .order("field_key");
  const fields = (rows ?? []) as Array<Record<string, unknown>>;
  const passageIds = [...new Set(fields.flatMap((f) => ((f.passage_ids as string[] | null) ?? []).slice(0, 1)))];
  const { data: passages } = passageIds.length
    ? await db.from("transcript_passages").select("id, call_id, speaker").eq("org_id", orgId).in("id", passageIds)
    : { data: [] };
  const byId = new Map(((passages ?? []) as Array<{ id: string; call_id: string; speaker: string }>).map((p) => [p.id, p]));

  const view: CaseFieldView[] = fields.map((f) => {
    const first = ((f.passage_ids as string[] | null) ?? [])[0];
    const passage = first ? byId.get(first) : undefined;
    return {
      key: String(f.field_key),
      label: String(f.label),
      value: (f.value as CaseFieldView["value"]) ?? null,
      state: f.state as CaseFieldView["state"],
      quote: (f.quote as string | null) ?? null,
      source: f.source as CaseFieldView["source"],
      locked: f.locked === true,
      editedAt: (f.edited_at as string | null) ?? null,
      suggestion: (f.scribe_value as CaseFieldView["suggestion"]) ?? null,
      reviewNote: (f.review_note as string | null) ?? null,
      from: passage ? { callId: passage.call_id, speaker: passage.speaker as "prospect" | "team" | "unknown" } : null,
    };
  });

  return {
    id: String(file.id),
    leadId: String(file.lead_id),
    status: file.status,
    summary: file.summary,
    nextStep: file.next_step,
    readinessReason: file.readiness_reason,
    score: file.score,
    band: file.band,
    bandMeaning: file.band_meaning,
    openQuestions: Array.isArray(file.open_questions) ? (file.open_questions as unknown[]).filter((q): q is string => typeof q === "string") : [],
    reviewReasons: (file.review_reasons as string[] | null) ?? [],
    heldReason: file.held_reason,
    version: file.version,
    lastCallId: file.last_call_id,
    lastRunId: file.last_run_id,
    builtAt: file.built_at,
    fields: view,
  };
}
