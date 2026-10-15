import type { OrgRole } from "@/types/database";

import type { NotificationChannel, NotificationEventType } from "@/lib/notifications/types";

type DefaultMap = Partial<Record<NotificationEventType, Partial<Record<NotificationChannel, boolean>>>>;

const SETTER: DefaultMap = {
  speed_to_lead: { push: true },
  unassigned_ready: { push: true },
  approaching_ghost: { email: true },
  pending_draft: { push: true },
  daily_brief: { email: true },
  hourly_summary: { push: true },
  test_send: { push: true, email: true, sms: true },
  task_assigned: { push: true },
  task_due: { push: true },
  task_overdue: { push: true },
  task_suggested: { push: true },
  lead_assigned: { push: true },
  lead_to_claim: { push: true },
  push_device: { email: true },
};

const CLOSER: DefaultMap = {
  call_starting_soon: { push: true },
  approaching_ghost: { email: true },
  pending_draft: { push: true },
  daily_brief: { email: true },
  hourly_summary: { push: true },
  test_send: { push: true, email: true, sms: true },
  task_assigned: { push: true },
  task_due: { push: true },
  task_overdue: { push: true },
  lead_assigned: { push: true },
  push_device: { email: true },
};

const MANAGER: DefaultMap = {
  speed_to_lead: { push: true },
  unmatched_transcript: { email: true, push: true },
  ingestion_stalled: { push: true, sms: false },
  crm_broken: { push: true, sms: false },
  adoption_warning: { email: true },
  approaching_ghost: { email: true },
  pending_draft: { push: true },
  daily_brief: { email: true },
  hourly_summary: { push: true },
  test_send: { push: true, email: true, sms: true, team: true },
  task_overdue: { email: true },
  routing_nobody: { push: true },
  away_holds_leads: { email: true },
  claim_timer_expired: { push: true },
  stale_reassign: { email: true },
  team_workload: { email: true },
  lead_reassigned: { email: true },
  push_device: { email: true },
};

export function defaultChannelEnabled(
  role: OrgRole,
  eventType: NotificationEventType,
  channel: NotificationChannel
): boolean {
  if (channel === "da_console") return false;
  if (channel === "sms") return false;
  const table = role === "setter" ? SETTER : role === "closer" ? CLOSER : MANAGER;
  return table[eventType]?.[channel] ?? false;
}
