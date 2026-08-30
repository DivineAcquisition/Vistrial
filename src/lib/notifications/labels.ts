import type { NotificationChannel, NotificationEventType } from "@/lib/notifications/types";

export const EVENT_LABELS: Record<NotificationEventType, string> = {
  speed_to_lead: "Someone waited too long",
  unassigned_ready: "Ready now, nobody assigned",
  approaching_ghost: "Going quiet",
  pending_draft: "A follow-up still needs approval",
  call_starting_soon: "Call starting soon",
  unmatched_transcript: "Recording we could not match",
  ingestion_stalled: "New leads have stopped arriving",
  crm_broken: "The CRM connection is broken",
  job_failure: "Something we run overnight failed",
  adoption_warning: "The team has gone quiet on the product",
  daily_brief: "Morning brief",
  hourly_summary: "Too many alerts this hour",
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
