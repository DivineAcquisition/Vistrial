import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptSecret } from "@/lib/ghl/crypto";
import { readActivation, type ActivationRow } from "@/lib/onboarding/activation";
import { caseFileProgress } from "@/lib/onboarding/case-files";
import { checkinItems, loadCheckinFacts, type CheckinItem } from "@/lib/onboarding/checkins";
import { readRecords, readResults, type DomainRecord, type RecordResult } from "@/lib/onboarding/email-domain";
import type { ProblemKind } from "@/lib/onboarding/import-plan";
import { isRejectionCode, type CarrierStatus, type RegistrationDetails, type RejectionCode } from "@/lib/onboarding/registration";
import { isPhase, readSteps, type CustomerStep, type Phase, type StageKey, type StageStatus, type WaitingOn } from "@/lib/onboarding/stages";
import type { SampleStep } from "@/lib/onboarding/sample";
import { createClient } from "@/lib/supabase/server";

/**
 * Reading the onboarding record. Customer screens read it as the person (the
 * database decides what an Owner or Member may see; Operators get nothing);
 * staff screens read it as the staff member, so row-level security keeps a
 * Service Team member to their assigned workspaces.
 */

async function userDb(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

export type CustomerView = {
  access: "owner" | "member" | "service_team" | "platform_admin";
  phase: Phase;
  live: boolean;
  wentLiveAt: string | null;
  liveSeenAt: string | null;
  steps: CustomerStep[];
  currentStage: StageKey | null;
  ownerConfirmedAt: string | null;
  pausedReason: string | null;
  textingEnabled: boolean;
  emailEnabled: boolean;
  sentryWatchUntil: string | null;
  activationPaused: boolean;
  business: { name: string; timezone: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null; address: string | null };
  approach: {
    templateName?: string;
    templateDescription?: string;
    businessDescription?: string;
    firstTouchMinutes?: number;
    afterHours?: string;
    maxSequenceLength?: number;
    maxSequenceDays?: number;
    urgencySignals?: string[];
    readyCriteria?: string[];
    confirmedAt?: string;
    adjustRequestedAt?: string;
  };
  messaging: {
    carrierStatus: CarrierStatus;
    senderConfirmed: boolean;
    detailsSavedAt: string | null;
    detailsComplete: boolean;
    fieldsSaved: string[];
    rejectionCode: RejectionCode | null;
    submittedAt: string | null;
    slow: boolean;
  };
  email: { domain: string | null; records: DomainRecord[]; lastResult: RecordResult[]; lastCheckedAt: string | null; verified: boolean; teamAskedAt: string | null };
  import: null | {
    id: string;
    status: string;
    lookbackDays: number;
    found: number;
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    skipReasons: Record<string, number>;
    doNotContact: number;
    basicCaseFiles: number;
    startedAt: string | null;
    finishedAt: string | null;
    problems: Partial<Record<ProblemKind, number>>;
  };
  importDefaults: { lookbackDays: number; maxLookbackDays: number; aiActiveDays: number };
  sample: null | { id: string; status: string; steps: SampleStep[]; failedStep: string | null; confirmedAt: string | null; cleaned: boolean; leadId: string | null; createdAt: string };
  agents: ActivationRow[];
  sentryWatchDays: number;
  checkinDays: number[];
  welcomeSeen: boolean;
  feedbackDue: boolean;
};

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseCustomerView(raw: Record<string, unknown>): CustomerView {
  const business = (raw.business ?? {}) as Record<string, unknown>;
  const approach = (raw.approach ?? {}) as Record<string, unknown>;
  const messaging = (raw.messaging ?? {}) as Record<string, unknown>;
  const email = (raw.email ?? {}) as Record<string, unknown>;
  const imp = raw.import as Record<string, unknown> | null;
  const sample = raw.sample as Record<string, unknown> | null;
  const defaults = (raw.import_defaults ?? {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined);
  return {
    access: (str(raw.access) ?? "member") as CustomerView["access"],
    phase: isPhase(raw.phase) ? raw.phase : "setup",
    live: raw.live === true,
    wentLiveAt: str(raw.went_live_at),
    liveSeenAt: str(raw.live_seen_at),
    steps: readSteps(raw.steps),
    currentStage: (str(raw.current_stage) as StageKey | null) ?? null,
    ownerConfirmedAt: str(raw.owner_confirmed_at),
    pausedReason: str(raw.paused_reason),
    textingEnabled: raw.texting_enabled !== false,
    emailEnabled: raw.email_enabled !== false,
    sentryWatchUntil: str(raw.sentry_watch_until),
    activationPaused: raw.activation_paused === true,
    business: {
      name: String(business.name ?? ""),
      timezone: String(business.timezone ?? "America/New_York"),
      contactName: str(business.contact_name),
      contactEmail: str(business.contact_email),
      contactPhone: str(business.contact_phone),
      address: str(business.address),
    },
    approach: {
      templateName: str(approach.template_name) ?? undefined,
      templateDescription: str(approach.template_description) ?? undefined,
      businessDescription: str(approach.business_description) ?? undefined,
      firstTouchMinutes: approach.first_touch_minutes == null ? undefined : num(approach.first_touch_minutes),
      afterHours: str(approach.after_hours) ?? undefined,
      maxSequenceLength: approach.max_sequence_length == null ? undefined : num(approach.max_sequence_length),
      maxSequenceDays: approach.max_sequence_days == null ? undefined : num(approach.max_sequence_days),
      urgencySignals: list(approach.urgency_signals),
      readyCriteria: list(approach.ready_criteria),
      confirmedAt: str(approach.confirmed_at) ?? undefined,
      adjustRequestedAt: str(approach.adjust_requested_at) ?? undefined,
    },
    messaging: {
      carrierStatus: (str(messaging.carrier_status) ?? "not_registered") as CarrierStatus,
      senderConfirmed: messaging.sender_confirmed === true,
      detailsSavedAt: str(messaging.details_saved_at),
      detailsComplete: messaging.details_complete === true,
      fieldsSaved: list(messaging.fields_saved) ?? [],
      rejectionCode: isRejectionCode(messaging.rejection_code) ? messaging.rejection_code : null,
      submittedAt: str(messaging.submitted_at),
      slow: messaging.slow === true,
    },
    email: {
      domain: str(email.domain),
      records: readRecords(email.records),
      lastResult: readResults(email.last_result),
      lastCheckedAt: str(email.last_checked_at),
      verified: email.verified === true,
      teamAskedAt: str(email.team_asked_at),
    },
    import: imp
      ? {
          id: String(imp.id),
          status: String(imp.status),
          lookbackDays: num(imp.lookback_days, 90),
          found: num(imp.found),
          imported: num(imp.imported),
          updated: num(imp.updated),
          skipped: num(imp.skipped),
          failed: num(imp.failed),
          skipReasons: (imp.skip_reasons ?? {}) as Record<string, number>,
          doNotContact: num(imp.do_not_contact),
          basicCaseFiles: num(imp.basic_case_files),
          startedAt: str(imp.started_at),
          finishedAt: str(imp.finished_at),
          problems: (imp.problems ?? {}) as Partial<Record<ProblemKind, number>>,
        }
      : null,
    importDefaults: {
      lookbackDays: num(defaults.lookback_days, 90),
      maxLookbackDays: num(defaults.max_lookback_days, 365),
      aiActiveDays: num(defaults.ai_active_days, 30),
    },
    sample: sample
      ? {
          id: String(sample.id),
          status: String(sample.status),
          steps: (Array.isArray(sample.steps) ? sample.steps : []) as SampleStep[],
          failedStep: str(sample.failed_step),
          confirmedAt: str(sample.confirmed_at),
          cleaned: sample.cleaned === true,
          leadId: str(sample.lead_id),
          createdAt: String(sample.created_at ?? ""),
        }
      : null,
    agents: readActivation(raw.agents),
    sentryWatchDays: num(raw.sentry_watch_days, 1),
    checkinDays: Array.isArray(raw.checkin_days) ? raw.checkin_days.map((day) => num(day)).filter(Boolean) : [1, 3, 7],
    welcomeSeen: raw.welcome_seen === true,
    feedbackDue: raw.feedback_due === true,
  };
}

/** The customer's setup, read as them. Null when they may not see it (Operators). */
export async function loadCustomerView(orgId: string): Promise<CustomerView | null> {
  const db = await userDb();
  const { data, error } = await db.rpc("onboarding_customer_view", { p_org_id: orgId });
  if (error || !data) return null;
  return parseCustomerView(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export type QueueRow = {
  org_id: string;
  name: string;
  slug: string;
  org_status: string;
  phase: Phase;
  created_at: string;
  current_stage: string | null;
  current_stage_label: string | null;
  waiting_on: WaitingOn;
  waiting_since: string | null;
  stuck: boolean;
  stuck_reason: string | null;
  next_action: string | null;
  next_action_stage: string | null;
  done_count: number;
  total_count: number;
  owner_confirmed_at: string | null;
  go_live_approved_at: string | null;
  settled_at: string | null;
  assigned: Array<{ user_id: string; name: string }>;
  template_name: string | null;
  updated_at: string;
};

export async function loadQueue(scope: "all" | "mine", includeSettled = false): Promise<QueueRow[]> {
  const db = await userDb();
  const { data, error } = await db.rpc("onboarding_queue", { p_scope: scope, p_include_settled: includeSettled });
  if (error) throw new Error(error.message);
  return (data ?? []) as QueueRow[];
}

export type StageRow = {
  stage_key: StageKey;
  status: StageStatus;
  detail: string | null;
  staff_detail: string | null;
  note: string | null;
  staff_note: string | null;
  eta: string | null;
  manual_state: string | null;
  skip_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  completed_by_label: string | null;
  waiting_since: string | null;
  version: number;
  definition: {
    position: number;
    customer_label: string;
    staff_label: string;
    why: string;
    owner: "customer" | "staff" | "both";
    completion: "automatic" | "manual";
    depends_on: string[];
    time_estimate: string;
    required_for_go_live: boolean;
  };
};

export type GoLiveCheck = {
  key: string;
  label: string;
  result: "pass" | "warning" | "fail";
  reason: string;
  fix_href: string;
  fix_label: string;
  accepted: boolean;
  accepted_reason?: string;
  accepted_by?: string;
  accepted_at?: string;
};

export type Workbench = {
  org: { id: string; name: string; slug: string; status: string; timezone: string; created_at: string; industry_template_id: string | null };
  header: Record<string, unknown> & { phase: Phase; checks: GoLiveCheck[]; steps: unknown };
  stages: StageRow[];
  staff: Record<string, unknown> | null;
  activation: ActivationRow[];
  importRun: Record<string, unknown> | null;
  problems: Array<{ id: string; kind: ProblemKind; display_label: string; decision: string; lead_id: string | null }>;
  caseFiles: Awaited<ReturnType<typeof caseFileProgress>> | null;
  sample: Record<string, unknown> | null;
  checkins: Array<{ id: string; day: number; due_at: string; status: string; staff_note: string | null; completed_by_label: string | null; completed_at: string | null; follow_up_at: string | null; items: CheckinItem[] }>;
  contacts: Array<{ id: string; position: number; display_name: string; channel: string; member_id: string | null; invite_id: string | null; test_sent_at: string | null; verified_at: string | null }>;
  registration: null | {
    provider: string;
    details: RegistrationDetails | null;
    detailsError: boolean;
    fields_complete: boolean;
    saved_at: string | null;
    saved_by_label: string | null;
    submitted_at: string | null;
    ein_handled_at: string | null;
    rejection_code: RejectionCode | null;
    rejection_note: string | null;
    external_reference: string | null;
  };
  readiness: { carrier_status: string; carrier_note: string | null; sender_confirmed: boolean; domain_confirmed: boolean } | null;
  emailSetup: { domain: string | null; records: DomainRecord[]; lastResult: RecordResult[]; verified_at: string | null; team_asked_at: string | null; last_checked_at: string | null } | null;
  ownerInvite: { id: string; email: string; expires_at: string; created_at: string } | null;
  people: Array<{ id: string; display_name: string | null; email: string; role: string; can_approve: boolean; last_seen_at: string | null }>;
  activity: Array<{ id: string; action: string; actor_label: string; created_at: string; detail: Record<string, unknown> }>;
  billing: { status: string | null; payment_failed_at: string | null } | null;
  templateDefaults: { import_lookback_days: number; sentry_watch_days: number } | null;
};

/** Everything the workbench shows. Null when the person may not see this workspace. */
export async function loadWorkbench(orgId: string): Promise<Workbench | null> {
  const db = await userDb();
  const { data: refreshed, error } = await db.rpc("onboarding_refresh", { p_org_id: orgId });
  if (error || !refreshed) return null;
  const header = (Array.isArray(refreshed) ? refreshed[0] : refreshed) as Workbench["header"];

  const [org, stages, defs, staff, activation, run, problems, sample, checkins, contacts, registration, readiness, emailSetup, invite, people, activity, billing] =
    await Promise.all([
      db.from("organizations").select("id, name, slug, status, timezone, created_at, industry_template_id").eq("id", orgId).maybeSingle(),
      db.from("workspace_onboarding_stages").select("*").eq("org_id", orgId),
      db.from("onboarding_stage_definitions").select("*").order("position"),
      db.from("onboarding_staff_details").select("*").eq("org_id", orgId).maybeSingle(),
      db.from("workspace_agent_activation").select("agent_id, stage, step_order, activated_at, activated_by_label").eq("org_id", orgId).order("step_order"),
      db.from("onboarding_import_runs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("onboarding_import_problems").select("id, kind, display_label, decision, lead_id").eq("org_id", orgId).order("created_at").limit(200),
      db.from("onboarding_sample_runs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("onboarding_checkins").select("*").eq("org_id", orgId).order("day"),
      db.from("workspace_escalation_contacts").select("*").eq("org_id", orgId).order("position"),
      db.from("messaging_registration_details").select("*").eq("org_id", orgId).maybeSingle(),
      db.from("messaging_readiness").select("carrier_status, carrier_note, sender_number_confirmed_at, sending_domain_confirmed_at").eq("org_id", orgId).maybeSingle(),
      db.from("email_domain_setup").select("*").eq("org_id", orgId).maybeSingle(),
      db.from("org_invites").select("id, email, expires_at, created_at").eq("org_id", orgId).eq("role", "owner").is("accepted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("org_members").select("id, display_name, email, role, can_approve, last_seen_at").eq("org_id", orgId).eq("seat", "customer").eq("active", true).order("role"),
      db.from("workspace_activity_log").select("id, action, actor_label, created_at, detail").eq("org_id", orgId).or("action.like.onboarding.%,action.like.messaging.%,action.like.email.%,action.like.escalation.%,action.like.invite.%").order("created_at", { ascending: false }).limit(40),
      db.from("workspace_billing").select("status, payment_failed_at").eq("org_id", orgId).maybeSingle(),
    ]);
  if (!org.data) return null;
  const orgRow = org.data as Workbench["org"];

  const definitions = new Map(((defs.data ?? []) as Array<StageRow["definition"] & { key: string }>).map((row) => [row.key, row]));
  const stageRows = ((stages.data ?? []) as Array<Omit<StageRow, "definition">>)
    .filter((row) => definitions.has(row.stage_key))
    .map((row) => ({ ...row, definition: definitions.get(row.stage_key)! }))
    .sort((a, b) => a.definition.position - b.definition.position);

  const since = String(header.go_live_approved_at ?? orgRow.created_at);
  const checkinRows = (checkins.data ?? []) as Array<Omit<Workbench["checkins"][number], "items"> & { facts: Record<string, unknown> }>;
  const facts = checkinRows.length ? await loadCheckinFacts(db, orgId, since) : null;

  const reg = registration.data as Record<string, unknown> | null;
  let details: RegistrationDetails | null = null;
  let detailsError = false;
  if (reg?.details_ciphertext) {
    try {
      details = JSON.parse(decryptSecret(String(reg.details_ciphertext))) as RegistrationDetails;
    } catch {
      detailsError = true;
    }
  }
  const ready = readiness.data as Record<string, unknown> | null;
  const email = emailSetup.data as Record<string, unknown> | null;
  const templateDefaults = orgRow.industry_template_id
    ? (await db.from("onboarding_template_defaults").select("import_lookback_days, sentry_watch_days").eq("template_id", orgRow.industry_template_id).maybeSingle()).data
    : null;

  return {
    org: orgRow,
    header: { ...header, checks: (Array.isArray(header.checks) ? header.checks : []) as GoLiveCheck[] },
    stages: stageRows,
    staff: (staff.data as Record<string, unknown> | null) ?? null,
    activation: readActivation(
      ((activation.data ?? []) as Array<{ agent_id: string; stage: string; step_order: number; activated_at: string | null }>).map((row) => ({
        agent: row.agent_id,
        stage: row.stage,
        order: row.step_order,
        activated_at: row.activated_at,
      }))
    ),
    importRun: (run.data as Record<string, unknown> | null) ?? null,
    problems: (problems.data ?? []) as Workbench["problems"],
    caseFiles: run.data ? await caseFileProgress(db, orgId) : null,
    sample: (sample.data as Record<string, unknown> | null) ?? null,
    checkins: checkinRows.map((row) => ({ ...row, items: facts ? checkinItems(facts) : [] })),
    contacts: (contacts.data ?? []) as Workbench["contacts"],
    registration: reg
      ? {
          provider: String(reg.provider ?? "crm_phone_registration"),
          details,
          detailsError,
          fields_complete: reg.fields_complete === true,
          saved_at: str(reg.saved_at),
          saved_by_label: str(reg.saved_by_label),
          submitted_at: str(reg.submitted_at),
          ein_handled_at: str(reg.ein_handled_at),
          rejection_code: isRejectionCode(reg.rejection_code) ? reg.rejection_code : null,
          rejection_note: str(reg.rejection_note),
          external_reference: str(reg.external_reference),
        }
      : null,
    readiness: ready
      ? {
          carrier_status: String(ready.carrier_status ?? "not_registered"),
          carrier_note: str(ready.carrier_note),
          sender_confirmed: Boolean(ready.sender_number_confirmed_at),
          domain_confirmed: Boolean(ready.sending_domain_confirmed_at),
        }
      : null,
    emailSetup: email
      ? {
          domain: str(email.domain),
          records: readRecords(email.records),
          lastResult: readResults(email.last_result),
          verified_at: str(email.verified_at),
          team_asked_at: str(email.team_asked_at),
          last_checked_at: str(email.last_checked_at),
        }
      : null,
    ownerInvite: (invite.data as Workbench["ownerInvite"]) ?? null,
    people: (people.data ?? []) as Workbench["people"],
    activity: (activity.data ?? []) as Workbench["activity"],
    billing: (billing.data as Workbench["billing"]) ?? null,
    templateDefaults: (templateDefaults as Workbench["templateDefaults"]) ?? null,
  };
}
