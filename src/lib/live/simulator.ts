import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENTS, LIVE_AGENT_IDS, type LiveAgentId } from "@/lib/agents/roster";
import { startRun, type RunRecorder } from "@/lib/live/record";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * The agent simulator. Platform Admins only, test workspaces only (the
 * database also refuses simulated runs anywhere else). It writes through the
 * real recorder, so every surface is tested on the real path. Nothing here
 * contacts a lead, the CRM, or any outside service.
 */

export const SIMULATION_SCENARIOS = [
  "normal",
  "approval",
  "question",
  "failed",
  "stuck",
  "burst",
  "paused",
  "provider_wait",
] as const;

export type SimulationScenario = (typeof SIMULATION_SCENARIOS)[number];

export const SCENARIO_LABEL: Record<SimulationScenario, string> = {
  normal: "A normal run",
  approval: "A run waiting for approval",
  question: "A run asking a question",
  failed: "A failed run",
  stuck: "A stuck run",
  burst: "A burst of many events",
  paused: "A paused agent",
  provider_wait: "Waiting on an outside service",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function db(): SupabaseClient {
  return getSupabaseAdmin() as unknown as SupabaseClient;
}

type Lead = { id: string; name: string };

async function pickLeads(orgId: string, count: number): Promise<Lead[]> {
  const { data } = await db()
    .from("leads")
    .select("id, first_name, last_name")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(Math.max(count, 1) * 3);
  const rows = (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>;
  const leads = rows.map((row) => ({
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "a lead",
  }));
  for (let i = leads.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [leads[i], leads[j]] = [leads[j], leads[i]];
  }
  return leads.slice(0, count);
}

function clock(): string {
  return new Date(Date.now() - 1000 * 60 * (5 + Math.floor(Math.random() * 50))).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function key(scenario: string): string {
  return `sim:${scenario}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

async function begin(input: {
  orgId: string;
  agentId: LiveAgentId;
  scenario: string;
  subject: string;
  lead?: Lead | null;
  plan: string[];
}): Promise<RunRecorder> {
  const recorder = await startRun({
    orgId: input.orgId,
    agentId: input.agentId,
    triggerKey: key(input.scenario),
    subjectLabel: input.subject,
    subjectHref: input.lead ? `/app/cases/${input.lead.id}` : null,
    leadId: input.lead?.id ?? null,
    plan: input.plan,
    simulated: true,
    configVersion: "simulation",
    sources: input.lead
      ? [
          { kind: "lead", label: input.lead.name, href: `/app/cases/${input.lead.id}` },
          { kind: "configuration", label: "Qualification", href: "/app/settings/configuration#qualification" },
        ]
      : [{ kind: "configuration", label: "Configuration", href: "/app/settings/configuration" }],
  });
  recorder.noteStaff("simulation", input.scenario);
  await recorder.begin();
  return recorder;
}

async function walk(recorder: RunRecorder, steps: Array<{ label: string; detail?: string; reason?: string }>, pace: number) {
  for (const item of steps) {
    const step = await recorder.step(item.label);
    await sleep(pace + Math.random() * pace * 0.6);
    await step.done({ detail: item.detail ?? null, reason: item.reason ?? null });
  }
}

const SCRIBE_PLAN = [
  "Checking the input and configuration",
  "Reading the transcript",
  "Finding relevant context",
  "Building the picture",
  "Scoring and reasoning",
  "Recommending the next step",
  "Checking its own work",
  "Saving and notifying",
];

async function scribeNormal(orgId: string, lead: Lead | null, pace: number) {
  const at = clock();
  const recorder = await begin({ orgId, agentId: "scribe", scenario: "normal", subject: `the call from ${at}${lead ? ` with ${lead.name}` : ""}`, lead, plan: SCRIBE_PLAN });
  await walk(
    recorder,
    [
      { label: "Checking the input and configuration", detail: "The source is allowed and the configuration is complete." },
      { label: `Reading the call from ${at}`, detail: "Found 2 speakers and 14 passages." },
      { label: "Finding relevant context", detail: "Looked at 1 earlier call and the objection library." },
      { label: "Building the picture", detail: "Found the timeline, the service wanted, and one objection about price." },
      {
        label: "Scoring readiness",
        reason: "The caller said they need it before the weekend and asked about price twice, so this lead scored warm.",
      },
      { label: "Recommending the next step", detail: "Call back tomorrow morning to confirm budget." },
      { label: "Checking its own work", detail: "Every claim has supporting evidence." },
    ],
    pace
  );
  await recorder.output({
    kind: "summary",
    title: "Case file summary",
    body: "Wants the service done before the weekend. Asked about price twice and wants to check with their partner. Open to a call tomorrow morning.",
  });
  await recorder.output({ kind: "change", title: "Updated readiness from cold to warm", before: { band: "Cold" }, after: { band: "Warm" } });
  const save = await recorder.step("Saving and notifying");
  await sleep(pace / 2);
  await save.done();
  await recorder.finish({ reason: "Built the case file and scored the lead warm." });
}

async function sentryNormal(orgId: string, lead: Lead | null, pace: number) {
  const recorder = await begin({
    orgId,
    agentId: "sentry",
    scenario: "normal",
    subject: lead ? `${lead.name}'s response window` : "a response window",
    lead,
    plan: ["Checking the response window", "Looking at the last touch", "Deciding urgency"],
  });
  await walk(
    recorder,
    [
      { label: "Checking the response window", detail: "The window is 15 minutes during business hours." },
      { label: "Looking at the last touch", detail: "The last human touch was 3 hours ago." },
      { label: "Deciding urgency", reason: "Past the follow-up window for a warm lead, so this is at risk." },
    ],
    pace
  );
  await recorder.output({ kind: "alert", title: "Follow-up at risk", body: "This lead is past its follow-up window." });
  await recorder.finish({ reason: "Raised a follow-up at risk." });
}

async function compassNormal(orgId: string, pace: number, actorMemberId?: string) {
  const recorder = await startRun({
    orgId,
    agentId: "compass",
    triggerKey: key("normal"),
    subjectLabel: "a question about objections",
    actorMemberId: actorMemberId ?? null,
    plan: ["Searching your call transcripts", "Comparing objections across 12 calls", "Drafting a script"],
    simulated: true,
    configVersion: "simulation",
  });
  await recorder.begin();
  await walk(
    recorder,
    [
      { label: "Searching your call transcripts", detail: "Found 12 calls from the last 30 days." },
      { label: "Comparing objections across 12 calls", detail: "Price came up in 7 calls, timing in 4." },
      { label: "Drafting a script" },
    ],
    pace
  );
  await recorder.output({
    kind: "answer",
    title: "Handling price objections",
    body: "Price is the most common objection (7 of 12 calls). The calls that moved forward named the cost of waiting before quoting a number.",
  });
  await recorder.finish({ reason: "Answered with 12 calls as sources." });
}

async function relayApproval(orgId: string, lead: Lead | null, pace: number) {
  const recorder = await begin({
    orgId,
    agentId: "relay",
    scenario: "approval",
    subject: lead ? `a follow-up for ${lead.name}` : "a follow-up",
    lead,
    plan: ["Reading Scribe's case file", "Checking quiet hours", "Drafting message", "Waiting for approval"],
  });
  await walk(
    recorder,
    [
      { label: "Reading Scribe's case file", detail: "Used the summary, the price objection, and the next step." },
      { label: "Checking quiet hours", detail: "It is within business hours for the lead." },
      { label: "Drafting message" },
    ],
    pace
  );
  const draft = "Hi! Thanks for the call earlier. Happy to walk through pricing options tomorrow morning if that works for you.";
  await recorder.output({ kind: "draft", title: "Follow-up text", body: draft });
  const { data: item } = await db()
    .from("approval_items")
    .insert({
      org_id: orgId,
      kind: "relay_draft",
      action_type: "quiet_lead_follow_up",
      title: lead ? `Send a follow-up to ${lead.name}` : "Send a follow-up",
      preview: draft,
      reason: "Scribe found a price objection and a callback request. Relay drafted a short reply in your voice.",
      lead_ids: lead ? [lead.id] : [],
      run_id: recorder.id,
      agent_id: "relay",
      urgency: 40,
      dedupe_key: `sim:${recorder.id}`,
    })
    .select("id")
    .single();
  const step = await recorder.step("Waiting for approval");
  await step.wait("Relay never sends a message without your approval.");
  await recorder.needPerson({
    kind: "approval",
    prompt: "Approve this follow-up text?",
    approvalItemId: (item as { id?: string } | null)?.id ?? null,
    whoCanAct: "Owners, approvers, and the Vistrial team",
  });
}

async function scribeQuestion(orgId: string, lead: Lead | null, pace: number) {
  const recorder = await begin({ orgId, agentId: "scribe", scenario: "question", subject: lead ? `${lead.name}'s call` : "a call", lead, plan: SCRIBE_PLAN.slice(0, 3) });
  await walk(recorder, [{ label: "Checking the input and configuration" }, { label: "Reading the transcript", detail: "The speaker labels are unclear." }], pace);
  const { data: item } = await db()
    .from("approval_items")
    .insert({
      org_id: orgId,
      kind: "scribe_question",
      action_type: "agent_question",
      title: "Which speaker is the salesperson?",
      reason: "The transcript labels both speakers as 'Speaker'. Scribe is not sure who is who and will not guess.",
      lead_ids: lead ? [lead.id] : [],
      run_id: recorder.id,
      agent_id: "scribe",
      urgency: 50,
      dedupe_key: `sim:${recorder.id}`,
    })
    .select("id")
    .single();
  await recorder.needPerson({
    kind: "question",
    prompt: "Which speaker is the salesperson?",
    approvalItemId: (item as { id?: string } | null)?.id ?? null,
    whoCanAct: "Anyone who can work this lead",
  });
}

async function scribeFailed(orgId: string, lead: Lead | null, pace: number) {
  const recorder = await begin({ orgId, agentId: "scribe", scenario: "failed", subject: lead ? `${lead.name}'s call` : "a call", lead, plan: SCRIBE_PLAN });
  await walk(recorder, [{ label: "Checking the input and configuration" }], pace);
  const step = await recorder.step("Reading the transcript");
  await sleep(pace);
  await step.fail("The recording was empty.");
  await recorder.fail(
    "Scribe could not read this call because the recording was empty. Upload the recording again or tell us to skip it.",
    "simulation: transcript length 0 after normalization (provider returned empty body)"
  );
}

async function stuckRun(orgId: string, lead: Lead | null, agentId: LiveAgentId) {
  const recorder = await begin({ orgId, agentId, scenario: "stuck", subject: lead ? `${lead.name}` : "a lead", lead, plan: ["Checking the input and configuration", "Reading the transcript"] });
  await recorder.step("Reading the transcript");
  await db()
    .from("agent_activity_runs")
    .update({ last_progress_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() })
    .eq("id", recorder.id);
  await db().rpc("agent_activity_mark_stuck", { p_minutes: 10 });
}

async function providerWait(orgId: string, lead: Lead | null, pace: number) {
  const recorder = await begin({ orgId, agentId: "scribe", scenario: "provider_wait", subject: lead ? `${lead.name}'s call` : "a call", lead, plan: SCRIBE_PLAN });
  await walk(recorder, [{ label: "Checking the input and configuration" }], pace);
  await recorder.waitingOnProvider("simulation: provider returned 503");
}

async function pauseAgent(orgId: string, agentId: LiveAgentId, adminName: string, adminMemberId?: string) {
  await db()
    .from("agent_presence_controls")
    .upsert(
      {
        org_id: orgId,
        agent_id: agentId,
        paused: true,
        changed_at: new Date().toISOString(),
        changed_by_member_id: adminMemberId ?? null,
        changed_by_name: `${adminName} (simulator)`,
        reason: "Paused from the simulator",
      },
      { onConflict: "org_id,agent_id" }
    );
}

export async function runSimulation(input: {
  orgId: string;
  scenario: SimulationScenario;
  agentId?: LiveAgentId;
  adminName: string;
  adminMemberId?: string;
}): Promise<{ runs: number; ms: number }> {
  const started = Date.now();
  const { data: org } = await db().from("organizations").select("is_test_workspace").eq("id", input.orgId).maybeSingle();
  if (!(org as { is_test_workspace?: boolean } | null)?.is_test_workspace) {
    throw new Error("The simulator only runs in a test workspace.");
  }
  const pace = 1400;
  const [lead] = await pickLeads(input.orgId, 1);
  const agent = input.agentId ?? "scribe";
  let runs = 1;
  switch (input.scenario) {
    case "normal":
      if (agent === "sentry") await sentryNormal(input.orgId, lead ?? null, pace);
      else if (agent === "compass") await compassNormal(input.orgId, pace, input.adminMemberId);
      else if (agent === "relay") await relayApproval(input.orgId, lead ?? null, pace);
      else await scribeNormal(input.orgId, lead ?? null, pace);
      break;
    case "approval":
      await relayApproval(input.orgId, lead ?? null, pace);
      break;
    case "question":
      await scribeQuestion(input.orgId, lead ?? null, pace);
      break;
    case "failed":
      await scribeFailed(input.orgId, lead ?? null, pace);
      break;
    case "stuck":
      await stuckRun(input.orgId, lead ?? null, agent);
      break;
    case "provider_wait":
      await providerWait(input.orgId, lead ?? null, pace);
      break;
    case "paused":
      await pauseAgent(input.orgId, agent === "scribe" ? "sentry" : agent, input.adminName, input.adminMemberId);
      runs = 0;
      break;
    case "burst": {
      const leads = await pickLeads(input.orgId, 12);
      const jobs: Promise<void>[] = [];
      runs = 40;
      for (let i = 0; i < runs; i += 1) {
        const who = leads[i % Math.max(leads.length, 1)] ?? null;
        const id = LIVE_AGENT_IDS[i % 3];
        jobs.push(
          (async () => {
            const recorder = await begin({
              orgId: input.orgId,
              agentId: id,
              scenario: "burst",
              subject: who ? `${who.name}` : `item ${i + 1}`,
              lead: who,
              plan: ["Checking", "Working", "Saving"],
            });
            await walk(recorder, [{ label: "Checking" }, { label: "Working" }, { label: "Saving" }], 120);
            await recorder.finish({ reason: `${AGENTS[id].name} finished burst item ${i + 1}.` });
          })()
        );
      }
      await Promise.all(jobs);
      break;
    }
  }
  return { runs, ms: Date.now() - started };
}
