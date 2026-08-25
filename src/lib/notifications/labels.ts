import type { NotificationChannel, NotificationEventType } from "@/lib/notifications/types";

export const EVENT_LABELS: Record<NotificationEventType, string> = {
  speed_to_lead: "Speed-to-lead breach",
  unassigned_ready: "Unassigned ready-track lead",
  approaching_ghost: "Approaching ghost",
  pending_draft: "Pending draft",
  call_starting_soon: "Call starting soon",
  unmatched_transcript: "Unmatched transcript",
  ingestion_stalled: "Ingestion stalled",
  crm_broken: "CRM connection broken",
  job_failure: "Scheduled job failure",
  adoption_warning: "Adoption warning",
  daily_brief: "Daily brief",
  hourly_summary: "Hourly overflow summary",
  test_send: "Test send",
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  push: "Push",
  email: "Email",
  sms: "SMS",
  team: "Slack or Teams",
  da_console: "Operator console",
};

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};
