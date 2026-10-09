import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireConfig } from "@/lib/config/server";
import { anthropicApiKey, anthropicDraftModel, createAnthropicMessage } from "@/lib/extraction/anthropic";
import { agentMayRun, startRun, type RunRecorder } from "@/lib/live/record";
import { checkDraft, type CheckFault } from "@/lib/relay/check";
import { buildFacts, factsForChannel, pickChannel, type CaseFieldRow, type RelayChannel } from "@/lib/relay/facts";
import { buildFooter } from "@/lib/relay/footer";
import {
  RELAY_SYSTEM_PROMPT,
  estimateCostMicros,
  parseRelayOutput,
  relayUserPrompt,
  voiceFromConfig,
  type RelayFeedbackExample,
  type RelayTrigger,
} from "@/lib/relay/prompt";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

/**
 * Relay drafts outbound messages for a person to approve and send from the
 * CRM. It never sends, never replies to a lead, and never reads what a lead
 * wrote. Job errors are short codes; draft text stays in relay_drafts and on
 * the approval request, never in run events, outputs, or logs.
 */

type Loose = SupabaseClient;

export const RELAY_DAILY_LIMIT = 300;
export const RELAY_MAX_ATTEMPTS = 3;
const PER_PASS = 10;
const PER_ORG_PER_PASS = 2;

function db(): Loose {
  return getSupabaseAdmin() as unknown as Loose;
}

export type RelayJob = {
  id: string;
  org_id: string;
  lead_id: string;
  trigger: RelayTrigger;
  attempts: number;
  created_at: string;
};

export async function enqueueRelayJob(input: { orgId: string; leadId: string; trigger: RelayTrigger; dedupeKey: string }): Promise<boolean> {
  const { data, error } = await db()
    .from("relay_jobs")
    .upsert(
      { org_id: input.orgId, lead_id: input.leadId, trigger: input.trigger, dedupe_key: input.dedupeKey.slice(0, 200) },
      { onConflict: "org_id,dedupe_key", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error("relay_enqueue_failed");
  return Boolean(data);
}

type Outcome =
  | { kind: "drafted"; draftId: string }
  | { kind: "skipped"; result: string }
  | { kind: "later"; result: string; minutes: number }
  | { kind: "retry"; code: string }
  | { kind: "dead"; code: string };

export type RelayPass = { claimed: number; drafted: number; skipped: number; retried: number; dead: number; expired: number };

export async function processRelayJobs(): Promise<RelayPass> {
  const client = db();
  const pass: RelayPass = { claimed: 0, drafted: 0, skipped: 0, retried: 0, dead: 0, expired: 0 };
  const { data: expired } = await client.rpc("relay_expire_requests");
  pass.expired = Number(expired ?? 0);

  const { data: claimed, error } = await client.rpc("relay_claim_jobs", { p_limit: PER_PASS, p_per_org: PER_ORG_PER_PASS });
  if (error) throw new Error("relay_claim_failed");
  const jobs = (claimed ?? []) as RelayJob[];
  pass.claimed = jobs.length;

  for (const job of jobs) {
    let outcome: Outcome;
    try {
      outcome = await draftForJob(job);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message.slice(0, 60) : "relay_failed";
      outcome = job.attempts >= RELAY_MAX_ATTEMPTS ? { kind: "dead", code } : { kind: "retry", code };
    }
    await settle(job, outcome);
    if (outcome.kind === "drafted") pass.drafted += 1;
    else if (outcome.kind === "skipped") pass.skipped += 1;
    else if (outcome.kind === "dead") pass.dead += 1;
    else pass.retried += 1;
  }

  await client.from("relay_runtime").update({ last_pass_at: new Date().toISOString(), last_pass: pass }).eq("id", true);
  return pass;
}

async function settle(job: RelayJob, outcome: Outcome): Promise<void> {
  const client = db();
  const base = { claimed_at: null };
  if (outcome.kind === "drafted") {
    await client.from("relay_jobs").update({ ...base, status: "done", draft_id: outcome.draftId, result: "Draft waiting for approval.", last_error: null }).eq("id", job.id);
  } else if (outcome.kind === "skipped") {
    await client.from("relay_jobs").update({ ...base, status: "skipped", result: outcome.result.slice(0, 300) }).eq("id", job.id);
  } else if (outcome.kind === "later") {
    await client
      .from("relay_jobs")
      .update({
        ...base,
        status: "pending",
        attempts: Math.max(0, job.attempts - 1),
        result: outcome.result.slice(0, 300),
        next_attempt_at: new Date(Date.now() + outcome.minutes * 60_000).toISOString(),
      })
      .eq("id", job.id);
  } else if (outcome.kind === "retry") {
    await client
      .from("relay_jobs")
      .update({ ...base, status: "pending", last_error: outcome.code, next_attempt_at: new Date(Date.now() + 2 ** job.attempts * 60_000).toISOString() })
      .eq("id", job.id);
  } else {
    await client.from("relay_jobs").update({ ...base, status: "dead", last_error: outcome.code }).eq("id", job.id);
  }
}

type LeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  offer_name: string | null;
  status: string;
  do_not_contact: boolean;
  merged_into: string | null;
  assigned_setter_id: string | null;
  assigned_closer_id: string | null;
};

async function draftForJob(job: RelayJob): Promise<Outcome> {
  const client = db();
  const may = await agentMayRun(job.org_id, "relay");
  if (!may.ok) {
    return may.reason === "paused"
      ? { kind: "skipped", result: "Relay is paused in this workspace, so nothing was drafted." }
      : { kind: "skipped", result: "This workspace is not active, so nothing was drafted." };
  }

  const { data: leadData } = await client
    .from("leads")
    .select("id, first_name, last_name, phone, email, offer_name, status, do_not_contact, merged_into, assigned_setter_id, assigned_closer_id")
    .eq("id", job.lead_id)
    .eq("org_id", job.org_id)
    .maybeSingle();
  const lead = leadData as LeadRow | null;
  if (!lead) return { kind: "skipped", result: "The lead is gone." };
  if (lead.status === "closed_won" || lead.status === "closed_lost") return { kind: "skipped", result: "The lead is closed." };

  const { data: block } = await client.rpc("gate_lead_block", { p_org_id: job.org_id, p_lead_ids: [job.lead_id], p_since: job.created_at });
  if (typeof block === "string" && block) return { kind: "skipped", result: block };

  const { data: lastTouch } = await client
    .from("touches")
    .select("direction")
    .eq("org_id", job.org_id)
    .eq("lead_id", job.lead_id)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((lastTouch as { direction?: string } | null)?.direction === "inbound") {
    return { kind: "skipped", result: "The lead wrote in last, so a person should answer them. Relay does not reply." };
  }

  const { count: open } = await client
    .from("approval_items")
    .select("id", { count: "exact", head: true })
    .eq("org_id", job.org_id)
    .eq("agent_id", "relay")
    .in("status", ["pending", "approved"])
    .contains("lead_ids", [job.lead_id]);
  if ((open ?? 0) > 0) return { kind: "skipped", result: "A Relay draft for this lead is already waiting." };

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: today } = await client
    .from("relay_drafts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", job.org_id)
    .gte("created_at", dayStart.toISOString());
  if ((today ?? 0) >= RELAY_DAILY_LIMIT) return { kind: "later", result: "This workspace reached today's draft limit.", minutes: 60 };

  const channel = pickChannel(lead);
  if (!channel) return { kind: "skipped", result: "There is no phone number or email for this lead." };

  const [{ data: caseFile }, { data: fieldRows }] = await Promise.all([
    client.from("case_files").select("status, summary, next_step").eq("org_id", job.org_id).eq("lead_id", job.lead_id).maybeSingle(),
    client
      .from("case_file_fields")
      .select("field_key, label, value, state, quote")
      .eq("org_id", job.org_id)
      .eq("lead_id", job.lead_id)
      .eq("state", "present")
      .limit(60),
  ]);
  const file = caseFile as { status?: string; summary?: string | null; next_step?: string | null } | null;
  if (file?.status === "held") return { kind: "skipped", result: "The case file is held for a person to review." };

  const gate = await requireConfig(getSupabaseAdmin() as unknown as SupabaseClient<Database>, job.org_id, "follow_up_drafter");
  if (!gate.ok) return { kind: "skipped", result: "The workspace's configuration needs attention, so Relay stopped. See Settings → Configuration." };
  const values = gate.config.values as Record<string, unknown>;

  const facts = factsForChannel(
    buildFacts({
      lead: { first_name: lead.first_name, offer_name: lead.offer_name },
      caseFile: file ? { summary: file.summary ?? null, next_step: file.next_step ?? null } : null,
      fields: (fieldRows ?? []) as CaseFieldRow[],
      businessName: typeof values["identity.display_name"] === "string" ? (values["identity.display_name"] as string) : null,
      senderName: typeof values["tone.sender_identity"] === "string" ? (values["tone.sender_identity"] as string) : null,
    }),
    channel
  );
  if (!facts.some((fact) => fact.source === "case_file")) {
    return { kind: "skipped", result: "The case file has nothing Relay can use yet." };
  }
  if (!anthropicApiKey()) return { kind: "dead", code: "missing_api_key" };

  const name = lead.first_name?.trim() || "this lead";
  const recorder = await startRun({
    orgId: job.org_id,
    agentId: "relay",
    triggerKey: `relay:${job.id}`,
    subjectLabel: `a ${channel === "sms" ? "text" : "email"} for ${name}`,
    subjectHref: `/app/cases/${job.lead_id}`,
    leadId: job.lead_id,
    plan: ["Reading the case file", "Writing a draft", "Checking the draft", "Waiting for approval"],
    configVersion: gate.config.version,
    sources: [{ kind: "case_file", label: "Case file", href: `/app/cases/${job.lead_id}` }],
  });
  await recorder.begin();
  try {
    return await writeAndQueue({ job, lead, name, channel, facts, values, recorder, configVersion: gate.config.version });
  } catch (cause) {
    const code = cause instanceof Error ? cause.message.slice(0, 60) : "relay_failed";
    if (job.attempts >= RELAY_MAX_ATTEMPTS) {
      await recorder.fail("Relay could not write this draft. The Vistrial team has been told. Nothing was sent.", code);
      throw cause;
    }
    await recorder.waitingOnProvider(code);
    throw cause;
  }
}

async function writeAndQueue(args: {
  job: RelayJob;
  lead: LeadRow;
  name: string;
  channel: RelayChannel;
  facts: ReturnType<typeof factsForChannel>;
  values: Record<string, unknown>;
  recorder: RunRecorder;
  configVersion: string;
}): Promise<Outcome> {
  const { job, channel, facts, values, recorder } = args;
  const client = db();

  const reading = await recorder.step("Reading the case file");
  await reading.done({
    detail: `${facts.length} fact${facts.length === 1 ? "" : "s"} it may use. Nothing the lead wrote was read.`,
    sources: [{ kind: "case_file", label: "Case file", href: `/app/cases/${job.lead_id}` }],
  });

  const { data: feedbackRows } = await client
    .from("relay_feedback")
    .select("kind, original_body, final_body, reason")
    .eq("org_id", job.org_id)
    .eq("channel", channel)
    .in("kind", ["edited", "rejected"])
    .order("created_at", { ascending: false })
    .limit(3);
  const feedback: RelayFeedbackExample[] = ((feedbackRows ?? []) as Array<{ kind: "edited" | "rejected"; original_body: string; final_body: string | null; reason: string | null }>).map(
    (row) => ({ kind: row.kind, before: row.original_body.slice(0, 600), after: row.final_body?.slice(0, 600) ?? null, reason: row.reason })
  );

  const voice = voiceFromConfig(values);
  const writing = await recorder.step("Writing a draft");
  let draft: { body: string; subject: string | null; factsUsed: string[] } | null = null;
  let faults: CheckFault[] = [];
  let model = anthropicDraftModel();
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await createAnthropicMessage({
      system: RELAY_SYSTEM_PROMPT,
      user: relayUserPrompt({ trigger: job.trigger, channel, facts, voice, feedback, previousFaults: faults.map((fault) => fault.message) }),
      model,
      maxTokens: 900,
      timeoutMs: 45_000,
    });
    model = result.model;
    inputTokens += result.inputTokens;
    outputTokens += result.outputTokens;
    let parsed: { body: string; subject: string | null; factsUsed: string[] };
    try {
      parsed = parseRelayOutput(result.text, channel);
    } catch {
      faults = [{ code: "empty", message: "The answer was not in the expected form." }];
      continue;
    }
    faults = checkDraft({ channel, body: parsed.body, subject: parsed.subject, factsUsed: parsed.factsUsed, facts, values });
    draft = parsed;
    if (faults.length === 0) break;
  }
  recorder.noteStaff("model", { model, inputTokens, outputTokens });
  await writing.done({ detail: `Wrote a ${channel === "sms" ? "text" : "email"} in this workspace's voice.` });

  const checking = await recorder.step("Checking the draft");
  if (!draft || faults.length) {
    await checking.fail(faults.map((fault) => fault.message).join(" ").slice(0, 600) || "The draft did not pass.");
    await recorder.fail(
      "Relay could not write a draft that passed its checks, so nothing was put in front of you and nothing was sent.",
      `checks_failed: ${faults.map((fault) => fault.code).join(",")}`
    );
    return { kind: "dead", code: "checks_failed" };
  }
  await checking.done({ detail: "No invented details, links, or opt-out text. Every point traces to the case file." });

  const used = new Set(draft.factsUsed);
  const footer = buildFooter({ channel, optOutWords: values["compliance.opt_out_words"], disclosures: values["compliance.required_disclosures"] });
  const staleDays = Number(values["response.draft_stale_days"] ?? 5);
  const expiresAt = new Date(Date.now() + Math.max(1, staleDays) * 24 * 60 * 60 * 1000).toISOString();
  const assigned = args.lead.assigned_setter_id ?? args.lead.assigned_closer_id ?? null;
  const actionType = channel === "sms" ? "send_text" : "send_email";
  const { data: rule } = await client.from("approval_gate_actions").select("approver").eq("org_id", job.org_id).eq("action_type", actionType).maybeSingle();
  const approver = (rule as { approver?: string } | null)?.approver ?? "owners_and_managers";
  const whoCanAct =
    approver === "owner_only" ? "The owner or the Vistrial team" : approver === "assigned" && assigned ? "The assigned person, the owner, or the Vistrial team" : "Owners, approvers, and the Vistrial team";

  const { data: item, error: itemError } = await client
    .from("approval_items")
    .insert({
      org_id: job.org_id,
      area: "sales",
      kind: "relay_draft",
      action_type: actionType,
      status: "pending",
      urgency: job.trigger === "missed_window" ? 80 : 60,
      title: `${channel === "sms" ? "Text" : "Email"} for ${args.name}`,
      preview: draft.body,
      reason:
        job.trigger === "missed_window"
          ? "Nobody has reached this lead within the response window. Approve it, then send it from your CRM."
          : "Scribe updated the case file after a call. Approve it, then send it from your CRM.",
      lead_ids: [job.lead_id],
      assigned_member_id: assigned,
      dedupe_key: `relay:${job.id}`,
      run_id: recorder.id,
      agent_id: "relay",
      expires_at: expiresAt,
      config_version: args.configVersion,
    })
    .select("id")
    .single();
  if (itemError || !item) throw new Error("relay_item_failed");
  const itemId = String((item as { id: string }).id);

  const costMicros = estimateCostMicros(model, inputTokens, outputTokens);
  const { data: saved, error: draftError } = await client
    .from("relay_drafts")
    .insert({
      org_id: job.org_id,
      lead_id: job.lead_id,
      approval_item_id: itemId,
      run_id: recorder.id,
      job_id: job.id,
      trigger: job.trigger,
      channel,
      body: draft.body,
      subject: draft.subject,
      footer,
      facts: facts.map((fact) => ({ key: fact.key, label: fact.label, value: fact.value, source: fact.source, quote: fact.quote, used: used.has(fact.key) })),
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_micros: costMicros,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (draftError || !saved) {
    await client.from("approval_items").delete().eq("id", itemId);
    throw new Error("relay_draft_failed");
  }

  await recorder.output({ kind: "draft", title: `${channel === "sms" ? "Text" : "Email"} drafted. Open the request to read it.` });
  const waiting = await recorder.step("Waiting for approval");
  await waiting.wait("Vistrial never sends it. A person approves it, sends it from the CRM, and marks it sent.");
  await recorder.needPerson({
    kind: "approval",
    prompt: `Approve this ${channel === "sms" ? "text" : "email"}, then send it from your CRM.`,
    approvalItemId: itemId,
    whoCanAct,
  });
  return { kind: "drafted", draftId: String((saved as { id: string }).id) };
}

/** Staff put a dead job back in line. */
export async function retryRelayJob(orgId: string, jobId: string): Promise<boolean> {
  const { data } = await db()
    .from("relay_jobs")
    .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null, claimed_at: null })
    .eq("id", jobId)
    .eq("org_id", orgId)
    .eq("status", "dead")
    .select("id")
    .maybeSingle();
  return Boolean(data);
}
