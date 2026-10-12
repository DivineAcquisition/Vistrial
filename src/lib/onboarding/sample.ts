import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENTS } from "@/lib/agents/roster";
import { startRun } from "@/lib/live/record";
import { enqueueRelayJob } from "@/lib/relay/run";

/**
 * The sample lead test. It creates one clearly labeled practice lead and runs
 * it down the real path: the lead arrives, Scribe builds a case file, a
 * response clock runs out, Sentry raises an alert (in Vistrial only), and
 * Relay drafts a follow-up that waits in the approval queue.
 *
 * The sample lead is a test lead: left out of every metric, export and
 * result; never in the CRM; and any "send" is recorded as a simulation before
 * any outside service is called. When the test is confirmed (or reported, or
 * left for a day) the lead and everything that names it are removed, and the
 * removal is checked.
 */

type Db = SupabaseClient;

export type SampleStepKey = "lead" | "case_file" | "clock" | "alert" | "draft";
export type SampleStep = { key: SampleStepKey; label: string; status: "done" | "working" | "waiting" | "failed"; detail?: string };

export const SAMPLE_NAME = { first: "Sample lead", last: "(test)" };
const RELAY_WAIT_MS = 10 * 60_000;
const AUTO_CLEANUP_MS = 24 * 3_600_000;

export function sampleSteps(): SampleStep[] {
  return [
    { key: "lead", label: "A sample lead arrives", status: "working" },
    { key: "case_file", label: `${AGENTS.scribe.name} builds a case file`, status: "waiting" },
    { key: "clock", label: "The response clock starts", status: "waiting" },
    { key: "alert", label: `${AGENTS.sentry.name} raises an alert when nobody responds`, status: "waiting" },
    { key: "draft", label: `${AGENTS.relay.name} drafts a follow-up for approval`, status: "waiting" },
  ];
}

function setStep(steps: SampleStep[], key: SampleStepKey, status: SampleStep["status"], detail?: string): SampleStep[] {
  return steps.map((step) => (step.key === key ? { ...step, status, ...(detail ? { detail } : {}) } : step));
}

async function save(db: Db, runId: string, patch: Record<string, unknown>) {
  await db.from("onboarding_sample_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", runId);
}

async function firstTouchMinutes(db: Db, orgId: string): Promise<number> {
  const { data } = await db.rpc("config_effective", { p_org_id: orgId });
  const minutes = Number((data as { values?: Record<string, unknown> } | null)?.values?.["response.first_touch_minutes"] ?? 15);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
}

/**
 * Starts a test, or returns the one already running. `actor` is the person
 * who pressed the button; the database has already checked they may.
 */
export async function startSampleRun(
  db: Db,
  args: { orgId: string; actorUserId: string; actorLabel: string; from: "customer" | "staff" }
): Promise<{ runId: string; existing: boolean }> {
  const { data: running } = await db
    .from("onboarding_sample_runs")
    .select("id")
    .eq("org_id", args.orgId)
    .eq("status", "running")
    .maybeSingle();
  if (running) return { runId: String((running as { id: string }).id), existing: true };

  const { data: org } = await db.from("organizations").select("owner_contact_phone, owner_contact_email").eq("id", args.orgId).maybeSingle();
  const contact = (org ?? {}) as { owner_contact_phone?: string | null; owner_contact_email?: string | null };
  const windowMinutes = await firstTouchMinutes(db, args.orgId);
  const arrived = new Date(Date.now() - (windowMinutes + 5) * 60_000).toISOString();

  // The Owner's own number stands in, so a draft has a channel; nothing is
  // ever sent to it (or to anyone) for a test lead.
  const { data: lead, error } = await db
    .from("leads")
    .insert({
      org_id: args.orgId,
      first_name: SAMPLE_NAME.first,
      last_name: SAMPLE_NAME.last,
      phone: contact.owner_contact_phone ?? "+15555550100",
      email: contact.owner_contact_phone ? null : (contact.owner_contact_email ?? null),
      source: "Sample lead test",
      status: "new",
      opted_in_at: arrived,
      is_test: true,
    })
    .select("id")
    .single();
  if (error || !lead) throw new Error("sample_lead_insert_failed");
  const leadId = String((lead as { id: string }).id);

  let steps = setStep(sampleSteps(), "lead", "done", "Labeled as a sample everywhere it appears. It is not in your CRM.");
  const { data: run, error: runError } = await db
    .from("onboarding_sample_runs")
    .insert({
      org_id: args.orgId,
      lead_id: leadId,
      status: "running",
      steps,
      started_by: args.actorUserId,
      started_by_label: args.actorLabel,
      started_from: args.from,
    })
    .select("id")
    .single();
  if (runError || !run) {
    await db.from("leads").delete().eq("id", leadId).eq("is_test", true);
    throw new Error("sample_run_insert_failed");
  }
  const runId = String((run as { id: string }).id);

  try {
    // Scribe: a case file (from the sample's details; no AI needed).
    const scribe = await startRun({
      orgId: args.orgId,
      agentId: "scribe",
      triggerKey: `sample:${runId}:scribe`,
      subjectLabel: "A case file for the sample lead",
      subjectHref: `/app/cases/${leadId}`,
      leadId,
      plan: ["Reading what is known", "Writing the case file"],
    });
    await scribe.begin();
    const read = await scribe.step("Reading what is known");
    await read.done({ detail: "The sample lead's details. Nothing was read from your CRM." });
    await db.from("case_files").upsert(
      {
        org_id: args.orgId,
        lead_id: leadId,
        status: "ready",
        depth: "basic",
        summary: "A sample lead for testing. They asked about your services this week and would like to hear back soon.",
        next_step: "Reply today to answer their question and offer a time to talk.",
        built_at: new Date().toISOString(),
      },
      { onConflict: "org_id,lead_id" }
    );
    const write = await scribe.step("Writing the case file");
    await write.done({ detail: "Summary and next step written." });
    await scribe.finish({ reason: "Sample case file ready. Nothing was sent." });
    steps = setStep(steps, "case_file", "done", "The case file is ready.");

    // Sentry: the response window has run out, so it raises an alert, in Vistrial only.
    const deadline = new Date(Date.parse(arrived) + windowMinutes * 60_000).toISOString();
    await db.from("sentry_clocks").upsert(
      {
        org_id: args.orgId,
        lead_id: leadId,
        kind: "first_touch",
        state: "missed",
        started_at: arrived,
        deadline_at: deadline,
        window_minutes: windowMinutes,
        elapsed_minutes: windowMinutes + 5,
        overdue_minutes: 5,
        reason: `No reply within ${windowMinutes} minutes (sample).`,
      },
      { onConflict: "org_id,lead_id" }
    );
    steps = setStep(steps, "clock", "done", `The window is ${windowMinutes} minutes. The sample lead arrived ${windowMinutes + 5} minutes ago.`);
    await db.from("sentry_alerts").insert({
      org_id: args.orgId,
      lead_id: leadId,
      level: 1,
      kind: "escalation",
      title: "Sample lead (test) missed a response window",
      body: "This is the sample test. In a live workspace your team would be told. Nobody was told this time.",
      notified_at: new Date().toISOString(),
    });
    const sentry = await startRun({
      orgId: args.orgId,
      agentId: "sentry",
      triggerKey: `sample:${runId}:sentry`,
      subjectLabel: "Response window for the sample lead",
      subjectHref: `/app/cases/${leadId}`,
      leadId,
      plan: ["Checking the response window", "Raising an alert"],
    });
    await sentry.begin();
    const check = await sentry.step("Checking the response window");
    await check.done({ detail: "Nobody replied in time." });
    const raise = await sentry.step("Raising an alert");
    await raise.done({ detail: "Sample: the alert is shown in Vistrial only. Nothing was sent to the team or the lead." });
    await sentry.finish({ reason: "Alert raised for the sample lead." });
    steps = setStep(steps, "alert", "done", "The alert is shown in Vistrial. Nobody was notified because this is a test.");

    // Relay: a real draft, through the approval queue. Any "send" is a simulation.
    await enqueueRelayJob({ orgId: args.orgId, leadId, trigger: "sample", dedupeKey: `sample:${runId}` });
    steps = setStep(steps, "draft", "working", "Writing a draft. This usually takes under a minute.");
    await save(db, runId, { steps });
  } catch (cause) {
    const failed = steps.find((step) => step.status !== "done")?.key ?? "lead";
    steps = setStep(steps, failed, "failed", "This step stopped. Your team has been told.");
    await save(db, runId, { steps, status: "failed", failed_step: steps.find((step) => step.key === failed)?.label ?? failed });
    void cause;
  }
  await db.rpc("onboarding_refresh", { p_org_id: args.orgId });
  return { runId, existing: false };
}

/** Moves running tests on: has Relay's draft arrived? Cleans up old ones. */
export async function advanceSampleRuns(db: Db): Promise<{ checked: number; passed: number; failed: number; cleaned: number }> {
  const { data } = await db
    .from("onboarding_sample_runs")
    .select("id, org_id, lead_id, status, steps, created_at, updated_at, cleaned_at, confirmed_at")
    .or("status.eq.running,and(cleaned_at.is.null,status.neq.running)")
    .limit(50);
  let passed = 0;
  let failed = 0;
  let cleaned = 0;
  const rows = (data ?? []) as Array<{
    id: string;
    org_id: string;
    lead_id: string | null;
    status: string;
    steps: SampleStep[];
    created_at: string;
    updated_at: string;
    cleaned_at: string | null;
    confirmed_at: string | null;
  }>;
  for (const run of rows) {
    if (run.status === "running" && run.lead_id) {
      const { data: job } = await db
        .from("relay_jobs")
        .select("status, result, draft_id")
        .eq("org_id", run.org_id)
        .eq("dedupe_key", `sample:${run.id}`)
        .maybeSingle();
      const relay = job as { status: string; result: string | null; draft_id: string | null } | null;
      let steps = Array.isArray(run.steps) ? run.steps : sampleSteps();
      if (relay?.status === "done" && relay.draft_id) {
        steps = setStep(steps, "draft", "done", "A draft is waiting in Needs your approval. Approving it sends nothing: this is the sample lead.");
        await save(db, run.id, { steps, status: "passed" });
        passed += 1;
      } else if (relay && (relay.status === "skipped" || relay.status === "dead")) {
        steps = setStep(steps, "draft", "failed", relay.result ?? "Relay could not write a draft.");
        await save(db, run.id, { steps, status: "failed", failed_step: `${AGENTS.relay.name} drafts a follow-up` });
        await db.from("onboarding_events").insert({ org_id: run.org_id, audience: "staff", kind: "sample_failed", stage_key: "sample_test" });
        failed += 1;
      } else if (Date.now() - Date.parse(run.created_at) > RELAY_WAIT_MS) {
        steps = setStep(steps, "draft", "failed", "The draft took too long. Your team has been told.");
        await save(db, run.id, { steps, status: "failed", failed_step: `${AGENTS.relay.name} drafts a follow-up` });
        await db.from("onboarding_events").insert({ org_id: run.org_id, audience: "staff", kind: "sample_failed", stage_key: "sample_test" });
        failed += 1;
      } else {
        continue;
      }
      await db.rpc("onboarding_refresh", { p_org_id: run.org_id });
      continue;
    }
    // Finished tests are removed once confirmed or reported, failed ones at
    // once, and any left alone after a day.
    const settled = run.confirmed_at || run.status === "problem_reported" || run.status === "failed";
    if (!run.cleaned_at && (settled || Date.now() - Date.parse(run.updated_at) > AUTO_CLEANUP_MS)) {
      await db.rpc("onboarding_sample_cleanup", { p_run_id: run.id });
      cleaned += 1;
    }
  }
  return { checked: rows.length, passed, failed, cleaned };
}
