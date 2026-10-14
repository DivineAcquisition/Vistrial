import type { CustomerView } from "./load";
import { STAGE_KEYS, type CustomerState, type CustomerStep, type Phase, type StageKey, type StageStatus } from "./stages";

/**
 * Made-up onboarding states for the layout reference, so each screen can be
 * checked in every state without a real workspace. No real business, person
 * or lead appears here.
 */

export const SAMPLE_STATES = [
  { id: "created", label: "Just created" },
  { id: "mid_setup", label: "Mid-setup" },
  { id: "carrier", label: "Waiting on the carriers" },
  { id: "blocked", label: "Blocked" },
  { id: "review", label: "Ready for review" },
  { id: "live", label: "Live" },
  { id: "settled", label: "Settled" },
] as const;

export type SampleState = (typeof SAMPLE_STATES)[number]["id"];

export function isSampleState(value: unknown): value is SampleState {
  return typeof value === "string" && SAMPLE_STATES.some((state) => state.id === value);
}

const LABELS: Record<StageKey, { label: string; owner: CustomerStep["owner"]; estimate: string }> = {
  workspace_created: { label: "Your workspace", owner: "staff", estimate: "Done by your team" },
  owner_account: { label: "Your account", owner: "customer", estimate: "About 2 minutes of your time" },
  approach: { label: "Choose your approach", owner: "both", estimate: "About 3 minutes of your time" },
  business_details: { label: "Business details and hours", owner: "customer", estimate: "About 5 minutes of your time" },
  crm: { label: "Connect your CRM", owner: "customer", estimate: "About 5 minutes of your time" },
  messaging: { label: "Connect messaging", owner: "both", estimate: "About 10 minutes, then 1 to 3 business days" },
  email: { label: "Email sending", owner: "both", estimate: "About 10 minutes of your time" },
  approvers: { label: "Choose who approves messages", owner: "customer", estimate: "About 2 minutes of your time" },
  escalation: { label: "Set escalation contacts", owner: "customer", estimate: "About 3 minutes of your time" },
  team: { label: "Invite your team", owner: "customer", estimate: "About 2 minutes of your time" },
  lead_import: { label: "Bring in your existing leads", owner: "both", estimate: "A few minutes of your time" },
  config_review: { label: "Team review", owner: "staff", estimate: "Usually within 1 business day" },
  sample_test: { label: "Test with a sample lead", owner: "both", estimate: "About 5 minutes of your time" },
  go_live_checks: { label: "Final checks", owner: "staff", estimate: "Done by your team" },
  go_live: { label: "Go live", owner: "both", estimate: "Within 1 business day" },
  first_week: { label: "First-week check-in", owner: "staff", estimate: "Days 1, 3, and 7 after going live" },
};

const STATUS_FOR: Record<CustomerState, StageStatus> = {
  done: "done",
  skipped: "skipped",
  waiting_on_customer: "waiting_on_customer",
  waiting_on_team: "waiting_on_team",
  in_progress: "in_progress",
  blocked: "blocked",
  coming_next: "not_started",
};

function steps(states: Partial<Record<StageKey, CustomerState>>, now: number, extra: Partial<Record<StageKey, Partial<CustomerStep>>> = {}): CustomerStep[] {
  return STAGE_KEYS.map((key) => {
    const state = states[key] ?? "coming_next";
    return {
      key,
      label: LABELS[key].label,
      why: "One line on why this step matters.",
      owner: LABELS[key].owner,
      estimate: LABELS[key].estimate,
      state,
      status: STATUS_FOR[state],
      waiting_since: state === "waiting_on_customer" || state === "waiting_on_team" ? new Date(now - 2 * 86_400_000).toISOString() : undefined,
      ...extra[key],
    };
  });
}

const DONE_TO = (last: StageKey): Partial<Record<StageKey, CustomerState>> =>
  Object.fromEntries(STAGE_KEYS.slice(0, STAGE_KEYS.indexOf(last) + 1).map((key) => [key, "done" as CustomerState]));

function base(phase: Phase, stepList: CustomerStep[], now: number): CustomerView {
  return {
    access: "owner",
    phase,
    live: phase === "live" || phase === "settled",
    wentLiveAt: phase === "live" || phase === "settled" ? new Date(now - 3 * 86_400_000).toISOString() : null,
    liveSeenAt: null,
    steps: stepList,
    currentStage: stepList.find((step) => step.state !== "done" && step.state !== "skipped")?.key ?? null,
    ownerConfirmedAt: null,
    pausedReason: null,
    textingEnabled: true,
    emailEnabled: true,
    sentryWatchUntil: null,
    activationPaused: false,
    business: { name: "Sample Business", timezone: "America/New_York", contactName: "Sample Owner", contactEmail: null, contactPhone: null, address: null },
    approach: {},
    messaging: { carrierStatus: "not_registered", senderConfirmed: false, detailsSavedAt: null, detailsComplete: false, fieldsSaved: [], rejectionCode: null, submittedAt: null, slow: false },
    email: { domain: null, records: [], lastResult: [], lastCheckedAt: null, verified: false, teamAskedAt: null },
    import: null,
    importDefaults: { lookbackDays: 90, maxLookbackDays: 365, aiActiveDays: 30 },
    sample: null,
    agents: [],
    sentryWatchDays: 1,
    checkinDays: [1, 3, 7],
    welcomeSeen: true,
    feedbackDue: false,
  };
}

export function sampleCustomerView(state: SampleState, now: number): CustomerView {
  switch (state) {
    case "created":
      return { ...base("setup", steps({ workspace_created: "done", owner_account: "waiting_on_customer" }, now), now), welcomeSeen: false };
    case "mid_setup":
      return base(
        "setup",
        steps(
          {
            ...DONE_TO("crm"),
            messaging: "waiting_on_customer",
            email: "waiting_on_customer",
            approvers: "waiting_on_customer",
            escalation: "waiting_on_customer",
            team: "waiting_on_customer",
            lead_import: "in_progress",
            config_review: "waiting_on_team",
          },
          now
        ),
        now
      );
    case "carrier":
      return {
        ...base(
          "setup",
          steps(
            { ...DONE_TO("team"), messaging: "waiting_on_team", lead_import: "done", config_review: "done", sample_test: "waiting_on_customer" },
            now,
            { messaging: { detail: "Submitted. Carrier approval usually takes 1 to 3 business days.", eta: "Thursday" } }
          ),
          now
        ),
        messaging: { carrierStatus: "pending", senderConfirmed: true, detailsSavedAt: new Date(now - 2 * 86_400_000).toISOString(), detailsComplete: true, fieldsSaved: [], rejectionCode: null, submittedAt: new Date(now - 2 * 86_400_000).toISOString(), slow: false },
      };
    case "blocked":
      return base(
        "setup",
        steps({ ...DONE_TO("business_details"), crm: "blocked", messaging: "waiting_on_customer" }, now, {
          crm: { detail: "The CRM connection stopped working. Reconnect it to carry on." },
        }),
        now
      );
    case "review":
      return {
        ...base("ready_for_review", steps({ ...DONE_TO("sample_test"), go_live_checks: "waiting_on_team", go_live: "waiting_on_team" }, now), now),
        ownerConfirmedAt: new Date(now - 3_600_000).toISOString(),
      };
    case "live":
      return {
        ...base("live", steps({ ...DONE_TO("go_live"), first_week: "waiting_on_team" }, now), now),
        agents: [
          { agent: "scribe", stage: "on", order: 1 },
          { agent: "sentry", stage: "watch", order: 2 },
          { agent: "relay", stage: "drafts_only", order: 3 },
          { agent: "compass", stage: "off", order: 4 },
        ],
      };
    case "settled":
      return {
        ...base("settled", steps(DONE_TO("first_week"), now), now),
        agents: [
          { agent: "scribe", stage: "on", order: 1 },
          { agent: "sentry", stage: "on", order: 2 },
          { agent: "relay", stage: "drafts_only", order: 3 },
          { agent: "compass", stage: "on", order: 4 },
        ],
      };
  }
}
