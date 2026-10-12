import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getEffectiveConfig } from "@/lib/config/server";
import { ghlError } from "@/lib/ghl/log";
import { startRun } from "@/lib/live/record";
import { analyzeCase } from "@/lib/scribe/analyze";
import { ProviderUnavailable } from "@/lib/scribe/provider";
import type { Database } from "@/types/database";

/**
 * Scribe's full case files for imported leads, at a controlled pace.
 *
 * Only leads marked eligible at import (open, active in the last N days) are
 * built, newest activity first, at most `limit` per workspace and `rate` per
 * hour. Past the limit a lead keeps its basic case file and is marked so.
 * Staff can pause it, or raise either number, per workspace; Platform Admins
 * set the defaults. A platform-wide halt or a paused Scribe stops it.
 *
 * This is setup work the Owner asked for, so it runs while the workspace is
 * still onboarding. It reads the lead's CRM details only, never what a lead
 * wrote, and it never contacts anyone.
 */

type Db = SupabaseClient;

const PER_TICK = 10;

export type Pace = { limit: number; ratePerHour: number; paused: boolean };

export function remainingAllowance(args: { pace: Pace; built: number; lastHour: number }): number {
  if (args.pace.paused) return 0;
  const underLimit = Math.max(0, args.pace.limit - args.built);
  const underRate = Math.max(0, args.pace.ratePerHour - args.lastHour);
  return Math.min(underLimit, underRate, PER_TICK);
}

async function pace(db: Db, orgId: string): Promise<Pace> {
  const [{ data: s }, { data: d }] = await Promise.all([
    db.from("staff_support_settings").select("onboarding_ai_case_file_limit, onboarding_ai_rate_per_hour").eq("id", true).maybeSingle(),
    db.from("onboarding_staff_details").select("ai_case_file_limit, ai_rate_per_hour, ai_paused").eq("org_id", orgId).maybeSingle(),
  ]);
  const defaults = (s ?? {}) as { onboarding_ai_case_file_limit?: number; onboarding_ai_rate_per_hour?: number };
  const own = (d ?? {}) as { ai_case_file_limit?: number | null; ai_rate_per_hour?: number | null; ai_paused?: boolean };
  return {
    limit: own.ai_case_file_limit ?? defaults.onboarding_ai_case_file_limit ?? 300,
    ratePerHour: own.ai_rate_per_hour ?? defaults.onboarding_ai_rate_per_hour ?? 60,
    paused: own.ai_paused === true,
  };
}

async function scribeHeld(db: Db, orgId: string): Promise<boolean> {
  const [{ data: org }, { data: control }, { data: halt }] = await Promise.all([
    db.from("organizations").select("status").eq("id", orgId).maybeSingle(),
    db.from("agent_presence_controls").select("paused").eq("org_id", orgId).eq("agent_id", "scribe").maybeSingle(),
    db.from("platform_agent_halts").select("halted").eq("agent_id", "scribe").maybeSingle(),
  ]);
  const status = (org as { status?: string } | null)?.status;
  return (
    (status !== "onboarding" && status !== "active") ||
    (control as { paused?: boolean } | null)?.paused === true ||
    (halt as { halted?: boolean } | null)?.halted === true
  );
}

/** Where a workspace stands, for the workbench. */
export async function caseFileProgress(db: Db, orgId: string): Promise<{
  pace: Pace;
  eligible: number;
  built: number;
  failed: number;
  overLimit: number;
  basicOnly: number;
}> {
  // Counted in the database after one access check: reading the marks
  // through their row policy would check every row of a large import.
  const [p, { data }] = await Promise.all([pace(db, orgId), db.rpc("onboarding_case_file_counts", { p_org_id: orgId })]);
  const counts = (data ?? {}) as Partial<Record<"waiting" | "built" | "failed" | "over_limit" | "none", number>>;
  const failed = counts.failed ?? 0;
  const overLimit = counts.over_limit ?? 0;
  return {
    pace: p,
    eligible: counts.waiting ?? 0,
    built: counts.built ?? 0,
    failed,
    overLimit,
    basicOnly: (counts.none ?? 0) + overLimit + failed,
  };
}

async function buildOne(db: Db, orgId: string, leadId: string, values: Record<string, unknown>, version: string): Promise<"done" | "wait" | "failed"> {
  const { data: claimed } = await db
    .from("lead_import_marks")
    .update({ ai_state: "running", ai_updated_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("ai_state", "eligible")
    .select("lead_id")
    .maybeSingle();
  if (!claimed) return "wait";

  const { data: leadRow } = await db
    .from("leads")
    .select("first_name, last_name, source, status, opted_in_at, offer_name, pipeline_stage")
    .eq("id", leadId)
    .eq("org_id", orgId)
    .maybeSingle();
  const lead = leadRow as { first_name: string | null; last_name: string | null; source: string | null; status: string; opted_in_at: string; offer_name: string | null; pipeline_stage: string | null } | null;
  if (!lead) {
    await db.from("lead_import_marks").update({ ai_state: "failed", ai_updated_at: new Date().toISOString() }).eq("lead_id", leadId);
    return "failed";
  }
  const name = lead.first_name?.trim() || "this lead";
  const recorder = await startRun({
    orgId,
    agentId: "scribe",
    triggerKey: `import-case-file:${leadId}`,
    subjectLabel: `A case file for ${name} from your CRM history`,
    subjectHref: `/app/cases/${leadId}`,
    leadId,
    plan: ["Reading the CRM details", "Writing the case file"],
    configVersion: version,
    sources: [{ kind: "configuration", label: "CRM details for this lead" }],
  });
  await recorder.begin();
  const reading = await recorder.step("Reading the CRM details");
  await reading.done({ detail: "Name, where they came from, stage, and dates. Nothing the lead wrote was read." });
  const writing = await recorder.step("Writing the case file");
  try {
    const crm = [
      lead.source ? `Came from ${lead.source}.` : null,
      lead.pipeline_stage ? `CRM stage: ${lead.pipeline_stage}.` : null,
      lead.offer_name ? `Interested in ${lead.offer_name}.` : null,
      `First added ${lead.opted_in_at.slice(0, 10)}.`,
    ].filter(Boolean);
    const analysis = await analyzeCase({
      businessDescription: String(values["industry.business_description"] ?? "a business that sells through conversations with its leads"),
      values,
      facts: [],
      callSummary: `No calls on record. This lead was brought in from the CRM. ${crm.join(" ")}`,
      agreedNextStep: null,
      score: null,
      band: null,
      earlier: [],
      extractedQuestions: [],
    });
    await db
      .from("case_files")
      .update({
        summary: analysis.summary,
        next_step: analysis.nextStep,
        readiness_reason: analysis.readinessReason,
        open_questions: analysis.openQuestions,
        depth: "full",
        status: "ready",
        config_version: version,
        last_run_id: recorder.id,
        built_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("lead_id", leadId);
    await writing.done({ detail: "Summary, next step, and open questions written." });
    await recorder.output({ kind: "summary", title: `Case file for ${name}`, body: analysis.summary });
    await recorder.finish({ reason: "Built from CRM details. No message was sent." });
    await db.from("lead_import_marks").update({ ai_state: "done", ai_updated_at: new Date().toISOString() }).eq("lead_id", leadId);
    return "done";
  } catch (cause) {
    if (cause instanceof ProviderUnavailable) {
      await writing.wait("Waiting on an outside service.");
      await recorder.waitingOnProvider(cause.message);
      await db.from("lead_import_marks").update({ ai_state: "eligible" }).eq("lead_id", leadId);
      return "wait";
    }
    await writing.fail("Could not write this case file.");
    await recorder.fail("Scribe could not write this case file. It keeps its basic case file.", cause instanceof Error ? cause.message : null);
    await db.from("lead_import_marks").update({ ai_state: "failed", ai_updated_at: new Date().toISOString() }).eq("lead_id", leadId);
    return "failed";
  }
}

export async function runImportCaseFiles(db: Db, budgetMs = 30_000): Promise<{ workspaces: number; built: number; overLimit: number }> {
  const deadline = Date.now() + budgetMs;
  const { data: waiting } = await db.from("lead_import_marks").select("org_id").eq("ai_state", "eligible").limit(2000);
  const orgs = [...new Set(((waiting ?? []) as Array<{ org_id: string }>).map((row) => row.org_id))];
  let built = 0;
  let overLimit = 0;
  for (const orgId of orgs) {
    if (Date.now() >= deadline) break;
    if (await scribeHeld(db, orgId)) continue;
    const p = await pace(db, orgId);
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const [{ count: builtCount }, { count: lastHour }] = await Promise.all([
      db.from("lead_import_marks").select("lead_id", { count: "exact", head: true }).eq("org_id", orgId).in("ai_state", ["done", "running", "failed"]),
      db.from("lead_import_marks").select("lead_id", { count: "exact", head: true }).eq("org_id", orgId).in("ai_state", ["done", "running", "failed"]).gte("ai_updated_at", hourAgo),
    ]);
    if (!p.paused && (builtCount ?? 0) >= p.limit) {
      const { count } = await db
        .from("lead_import_marks")
        .update({ ai_state: "over_limit", ai_updated_at: new Date().toISOString() }, { count: "exact" })
        .eq("org_id", orgId)
        .eq("ai_state", "eligible");
      overLimit += count ?? 0;
      continue;
    }
    const allowance = remainingAllowance({ pace: p, built: builtCount ?? 0, lastHour: lastHour ?? 0 });
    if (allowance <= 0) continue;
    let config: { values: Record<string, unknown>; version: string };
    try {
      const effective = await getEffectiveConfig(db as unknown as SupabaseClient<Database>, orgId);
      config = { values: effective.values as Record<string, unknown>, version: effective.version };
    } catch (cause) {
      ghlError("onboarding.case_files.config_failed", { orgId, error: cause instanceof Error ? cause.message : "unknown" });
      continue;
    }
    const { data: next } = await db
      .from("lead_import_marks")
      .select("lead_id")
      .eq("org_id", orgId)
      .eq("ai_state", "eligible")
      .order("crm_last_activity_at", { ascending: false, nullsFirst: false })
      .limit(allowance);
    for (const row of (next ?? []) as Array<{ lead_id: string }>) {
      if (Date.now() >= deadline) break;
      const result = await buildOne(db, orgId, row.lead_id, config.values, config.version).catch(() => "failed" as const);
      if (result === "done") built += 1;
      if (result === "wait") break;
    }
  }
  return { workspaces: orgs.length, built, overLimit };
}
