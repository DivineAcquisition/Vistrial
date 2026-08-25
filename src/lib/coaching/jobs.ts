import "server-only";

import { contrastingPhrases, phraseFindingStatement } from "@/lib/coaching/language";
import { CALL_QUALITY_MIN_N } from "@/lib/coaching/constants";
import { analyzeAndStoreCall } from "@/lib/coaching/persist";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import type { GhlDb } from "@/lib/ghl/tokens";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function runCallQualityJobs(db: GhlDb): Promise<{
  analyzed: { processed: number; failed: number };
  orgs: { processed: number; failed: number };
  benchmarks: { rows: number };
}> {
  const analyzed = { processed: 0, failed: 0 };
  const { data: pending, error: pendingError } = await db.rpc("list_call_quality_pending", {
    p_limit: 40,
  });
  if (pendingError) throw pendingError;

  for (const row of pending ?? []) {
    try {
      const result = await analyzeAndStoreCall(db, row.call_id);
      if (result.stored) analyzed.processed += 1;
    } catch (cause) {
      analyzed.failed += 1;
      ghlError("call_quality.analyze.failed", {
        error: cause instanceof Error ? cause.message : "analyze_failed",
      });
    }
  }

  const orgs = { processed: 0, failed: 0 };
  const { data: liveOrgs, error: orgError } = await db
    .from("organizations")
    .select("id")
    .is("offboarded_at", null);
  if (orgError) throw orgError;

  for (const org of liveOrgs ?? []) {
    const { error: refreshError } = await db.rpc("refresh_call_quality_org", { p_org_id: org.id });
    if (refreshError) {
      orgs.failed += 1;
      ghlError("call_quality.refresh.failed", { orgId: org.id, error: refreshError.message });
      continue;
    }
    try {
      await refreshLanguageFindings(db, org.id);
      orgs.processed += 1;
    } catch (cause) {
      orgs.failed += 1;
      ghlError("call_quality.language.failed", {
        orgId: org.id,
        error: cause instanceof Error ? cause.message : "language_failed",
      });
    }
  }

  const { data: bench, error: benchError } = await db.rpc("refresh_call_quality_benchmarks");
  if (benchError) {
    ghlError("call_quality.benchmarks.failed", { error: benchError.message });
    throw benchError;
  }

  ghlLog("call_quality.jobs.ran", {
    analyzed: analyzed.processed,
    orgs: orgs.processed,
    benchmarks: bench ?? 0,
  });

  if (analyzed.failed > 0 || orgs.failed > 0) {
    throw new Error(
      `call-quality job incomplete: ${analyzed.failed} analyze failures, ${orgs.failed} org refresh failures`
    );
  }

  return {
    analyzed,
    orgs,
    benchmarks: { rows: typeof bench === "number" ? bench : 0 },
  };
}

async function refreshLanguageFindings(db: GhlDb, orgId: string): Promise<void> {
  await db.from("call_coaching_findings").delete().eq("org_id", orgId).eq("finding_kind", "language");

  const { data, error } = await db.rpc("load_call_quality_language_corpus", { p_org_id: orgId });
  if (error) throw error;
  const payload = asRecord(data);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const closed: string[] = [];
  const lost: string[] = [];
  for (const item of rows) {
    const rec = asRecord(item);
    const transcript = typeof rec.transcript === "string" ? rec.transcript : "";
    if (!transcript) continue;
    if (rec.closed === true) closed.push(transcript);
    else lost.push(transcript);
  }
  const phrases = contrastingPhrases({
    closedTranscripts: closed,
    lostTranscripts: lost,
    minClosed: CALL_QUALITY_MIN_N,
  });
  if (phrases.length === 0) return;

  const { error: insertError } = await db.from("call_coaching_findings").insert(
    phrases.slice(0, 3).map((phrase) => ({
      org_id: orgId,
      finding_key: `language:${phrase.phrase.slice(0, 80)}`,
      finding_kind: "language" as const,
      sample_closed: closed.length,
      sample_lost: lost.length,
      bands_used: [],
      statement: phraseFindingStatement(phrase, closed.length, lost.length),
      lead_quality_caveat: null,
      evidence: {
        phrase: phrase.phrase,
        closedN: phrase.closedN,
        lostN: phrase.lostN,
      },
    }))
  );
  if (insertError) throw insertError;
}
