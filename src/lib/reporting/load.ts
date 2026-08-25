import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ReportingPanel } from "@/lib/reporting/constants";
import type { ReportingRange } from "@/lib/reporting/range";
import type { Json } from "@/types/database";
import {
  checkReportingHeadlines,
  collectPayloadRateFaults,
  parseHeadlineRate,
  type IntegritySnapshot,
} from "@/lib/verification/reporting";
import { persistBoundedVerification, taskVerificationEnabled } from "@/lib/verification/record";
import type { VerificationFault } from "@/lib/verification/types";

function asIntegrity(value: unknown): IntegritySnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { closedWonWithoutRevenue: 0, phantomTouches: 0, scoreDrift: 0 };
  }
  const row = value as Record<string, unknown>;
  const num = (key: string) => (typeof row[key] === "number" ? row[key] : 0);
  return {
    closedWonWithoutRevenue: num("closedWonWithoutRevenue"),
    phantomTouches: num("phantomTouches"),
    scoreDrift: num("scoreDrift"),
  };
}

function blockedPayload(faults: VerificationFault[]): Record<string, unknown> {
  return {
    blocked: true,
    faults,
    headline: null,
    source: "blocked",
  };
}

export async function loadReportingPanel(
  orgId: string,
  panel: ReportingPanel,
  range: ReportingRange
): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("load_reporting_panel", {
    p_org_id: orgId,
    p_panel: panel,
    p_from: range.from,
    p_to: range.to,
    p_range_key: range.key,
  });
  if (error) {
    throw new Error(error.message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Reporting panel returned no payload.");
  }
  const payload = data as Record<string, unknown>;
  const enabled = await taskVerificationEnabled("reporting");
  if (!enabled) return payload;

  const { data: integrityRaw } = await supabase.rpc("reporting_integrity_snapshot", {
    p_org_id: orgId,
  });
  const integrity = asIntegrity(integrityRaw);
  let recomputed = null as ReturnType<typeof parseHeadlineRate>;
  if (panel === "outcome") {
    const { data: recomputeRaw } = await supabase.rpc("reporting_recompute_outcome", {
      p_org_id: orgId,
      p_from: range.from,
      p_to: range.to,
    });
    recomputed = parseHeadlineRate(recomputeRaw);
  }

  const displayed = panel === "outcome" ? parseHeadlineRate(payload.headline) : null;
  const check = checkReportingHeadlines({
    displayed,
    recomputed,
    integrity,
  });
  const nested = collectPayloadRateFaults(payload);
  const faults = [...check.faults, ...nested.filter((item) => !check.faults.some((existing) => existing.what === item.what))];

  if (faults.length === 0) {
    if (panel === "outcome") {
      await persistBoundedVerification({
        orgId,
        task: "reporting",
        subjectType: "reporting_panel",
        subjectId: orgId,
        result: {
          output: payload,
          attempt: 1,
          retryHappened: false,
          finalState: "passed",
          stageCaught: "none",
          faults: [],
          modelInvoked: false,
          verificationModel: null,
          inputTokens: 0,
          outputTokens: 0,
          skippedReason: "reporting",
        },
      });
    }
    return payload;
  }

  await persistBoundedVerification({
    orgId,
    task: "reporting",
    subjectType: "reporting_panel",
    subjectId: orgId,
    result: {
      output: payload,
      attempt: 1,
      retryHappened: false,
      finalState: "blocked",
      stageCaught: "deterministic",
      faults,
      modelInvoked: false,
      verificationModel: null,
      inputTokens: 0,
      outputTokens: 0,
      skippedReason: "reporting",
    },
  });

  await getSupabaseAdmin().rpc("upsert_ops_alert", {
    p_fingerprint: `reporting_verification:${orgId}`,
    p_kind: "reporting_mismatch",
    p_severity: "critical",
    p_org_id: orgId,
    p_title: "A report was blocked because the numbers did not check out",
    p_check_first: "Compare reporting_compute_outcome with reporting_recompute_outcome and the integrity snapshot. Do not show the blocked figure.",
    p_detail: { panel, faults } as Json,
  });

  return blockedPayload(faults);
}

export async function loadReportingState(orgId: string): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reporting_org_state", { p_org_id: orgId });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? {}) as Record<string, unknown>;
}

export function asJson(value: unknown): Json {
  return value as Json;
}
