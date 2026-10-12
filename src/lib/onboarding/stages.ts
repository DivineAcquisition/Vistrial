import type { Tone } from "@/components/ui/tone";

/**
 * The onboarding record's vocabulary. The stage list itself lives in the
 * database (onboarding_stage_definitions) so Platform Admins can change its
 * wording and time estimates; these keys are the fixed identities every screen
 * and the database agree on. Nothing here is a second copy of the record.
 */

export const STAGE_KEYS = [
  "workspace_created",
  "owner_account",
  "approach",
  "business_details",
  "crm",
  "messaging",
  "email",
  "approvers",
  "escalation",
  "team",
  "lead_import",
  "config_review",
  "sample_test",
  "go_live_checks",
  "go_live",
  "first_week",
] as const;

export type StageKey = (typeof STAGE_KEYS)[number];

export function isStageKey(value: unknown): value is StageKey {
  return typeof value === "string" && (STAGE_KEYS as readonly string[]).includes(value);
}

/** What staff see. */
export const STAGE_STATUSES = [
  "not_started",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_team",
  "blocked",
  "done",
  "skipped",
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_STATUS_LABEL: Record<StageStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "warning" },
  waiting_on_customer: { label: "Waiting on customer", tone: "warning" },
  waiting_on_team: { label: "Waiting on team", tone: "neutral" },
  blocked: { label: "Blocked", tone: "critical" },
  done: { label: "Done", tone: "good" },
  skipped: { label: "Skipped", tone: "neutral" },
};

/** What customers see. "Coming next" stands in for a stage they cannot act on yet. */
export type CustomerState =
  | "done"
  | "skipped"
  | "waiting_on_customer"
  | "waiting_on_team"
  | "in_progress"
  | "blocked"
  | "coming_next";

export const CUSTOMER_STATE_LABEL: Record<CustomerState, { label: string; tone: Tone }> = {
  done: { label: "Done", tone: "good" },
  skipped: { label: "Not needed", tone: "neutral" },
  waiting_on_customer: { label: "Waiting on you", tone: "warning" },
  waiting_on_team: { label: "Your team is on it", tone: "neutral" },
  in_progress: { label: "In progress", tone: "warning" },
  blocked: { label: "Needs attention", tone: "critical" },
  coming_next: { label: "Coming next", tone: "neutral" },
};

export type Phase = "setup" | "ready_for_review" | "activating" | "live" | "settled" | "paused" | "cancelled";

export const PHASE_LABEL: Record<Phase, { label: string; tone: Tone }> = {
  setup: { label: "Setting up", tone: "neutral" },
  ready_for_review: { label: "Ready for review", tone: "warning" },
  activating: { label: "Switching agents on", tone: "warning" },
  live: { label: "Live", tone: "good" },
  settled: { label: "Settled", tone: "good" },
  paused: { label: "Paused", tone: "critical" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && value in PHASE_LABEL;
}

export type WaitingOn = "customer" | "team" | "both" | "nobody";

export const WAITING_ON_LABEL: Record<WaitingOn, string> = {
  customer: "Customer",
  team: "Vistrial team",
  both: "Customer and team",
  nobody: "Nobody",
};

/** One stage as the customer copy carries it (workspace_onboarding_status.steps). */
export type CustomerStep = {
  key: StageKey;
  label: string;
  why: string;
  owner: "customer" | "staff" | "both";
  estimate: string;
  state: CustomerState;
  status: StageStatus;
  detail?: string;
  note?: string;
  eta?: string;
  waiting_since?: string;
  finished_at?: string;
  required?: boolean;
  action?: { label: string; href: string };
};

export function isCustomerStep(value: unknown): value is CustomerStep {
  if (!value || typeof value !== "object") return false;
  const step = value as CustomerStep;
  return isStageKey(step.key) && typeof step.label === "string" && typeof step.state === "string" && step.state in CUSTOMER_STATE_LABEL;
}

export function readSteps(value: unknown): CustomerStep[] {
  return (Array.isArray(value) ? value : []).filter(isCustomerStep);
}

/** The next thing the customer can do: the first step waiting on them or needing attention. */
export function nextCustomerStep(steps: CustomerStep[]): CustomerStep | null {
  return steps.find((step) => (step.state === "waiting_on_customer" || step.state === "blocked") && step.action) ?? null;
}

export function progressCounts(steps: CustomerStep[]): { done: number; total: number } {
  const counted = steps.filter((step) => step.required !== false);
  return {
    done: counted.filter((step) => step.state === "done" || step.state === "skipped").length,
    total: counted.length,
  };
}

/** Whole days since a moment, for "waiting 3 days". */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((now - at) / 86_400_000));
}

export function waitingText(iso: string | null | undefined, now = Date.now()): string | null {
  const days = daysSince(iso, now);
  if (days === null) return null;
  if (days === 0) return "since today";
  return days === 1 ? "for 1 day" : `for ${days} days`;
}
