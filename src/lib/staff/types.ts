import type { LiveAgentId } from "@/lib/agents/roster";

export type StaffScope = "all" | "mine";

export type HealthLevel = "healthy" | "watch" | "needs_attention" | "onboarding";

export type HealthRules = {
  connection_failing: boolean;
  open_escalation: boolean;
  request_overdue: boolean;
  payment_failed: boolean;
  failed_runs_24h: number;
  response_met_percent: number;
  response_min_leads: number;
  response_period_days: number;
  draft_oldest_hours: number;
  onboarding_stall_days: number;
  agent_paused_watch: boolean;
};

export const DEFAULT_HEALTH_RULES: HealthRules = {
  connection_failing: true,
  open_escalation: true,
  request_overdue: true,
  payment_failed: true,
  failed_runs_24h: 3,
  response_met_percent: 80,
  response_min_leads: 10,
  response_period_days: 30,
  draft_oldest_hours: 24,
  onboarding_stall_days: 7,
  agent_paused_watch: true,
};

export type PausedAgent = {
  agent: LiveAgentId;
  reason: string | null;
  by_owner: boolean;
  platform?: boolean;
  by_name: string | null;
  at: string | null;
};

export type StaffPerson = { user_id: string; name: string };

/** One row of staff_roster_facts. */
export type RosterFacts = {
  org_id: string;
  name: string;
  slug: string;
  status: "onboarding" | "active" | "paused" | "closed";
  status_reason: string | null;
  is_platform_workspace: boolean;
  is_test_workspace: boolean;
  timezone: string;
  created_at: string;
  template_id: string | null;
  template_name: string | null;
  went_live_at: string | null;
  onboarding_steps: Record<string, { state?: string; note?: string | null; eta?: string | null }> | null;
  onboarding_updated_at: string | null;
  primary_contact: { name?: string; email?: string; phone?: string } | null;
  assigned: StaffPerson[];
  response_decided: number;
  response_within: number;
  open_alerts: number;
  open_escalations: number;
  pending_approvals: number;
  oldest_pending_at: string | null;
  crm_status: string;
  crm_verified_at: string | null;
  crm_error: string | null;
  crm_expired: boolean;
  sources_failing: number;
  sender_confirmed: boolean;
  domain_confirmed: boolean;
  carrier_status: string;
  billing_visible: boolean;
  billing_status: string | null;
  payment_failed_at: string | null;
  cancel_at_period_end: boolean | null;
  runs_24h: number;
  failed_runs_24h: number;
  paused_agents: PausedAgent[];
  requests_waiting: number;
  requests_overdue: number;
  requests_escalated: number;
  oldest_request_at: string | null;
  data_requests_open: number;
  last_activity_at: string | null;
};

export type HealthFactor = {
  key: string;
  level: Exclude<HealthLevel, "healthy" | "onboarding"> | "info";
  label: string;
  detail: string;
};

export type Health = {
  level: HealthLevel;
  factors: HealthFactor[];
};

export type ConnectionState = "ok" | "not_set_up" | "expired" | "failing" | "degraded";

export type ConnectionRow = {
  org_id: string;
  org_name: string;
  org_status: string;
  kind: "crm" | "source" | "messaging" | "carrier" | "email_domain" | "chat" | "events";
  label: string;
  state: ConnectionState;
  last_success_at: string | null;
  last_error: string | null;
  failing_since: string | null;
  detail: Record<string, unknown>;
};

export type QueueCounts = {
  escalations: number;
  requests: number;
  requests_overdue: number;
  data_requests: number;
  failed_runs: number;
};

export type SessionState =
  | { state: "active"; session_id: string; entered_at: string; ends_at: string }
  | { state: "none" | "timeout" | "idle" | "not_staff" };
