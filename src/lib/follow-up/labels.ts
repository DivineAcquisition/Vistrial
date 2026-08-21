import type { Enums } from "@/types/database";
import type { FollowUpBranch, FollowUpChannel, FollowUpDraftStatus } from "@/lib/follow-up/types";

export const FOLLOW_UP_BRANCH_LABELS: Record<FollowUpBranch, string> = {
  closed: "Closed",
  follow_up_scheduled: "Follow-up scheduled",
  objection_hold: "Objection hold",
  no_show: "No-show",
  not_interested: "Not interested",
  ghost_risk: "Ghost risk",
};

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpDraftStatus, string> = {
  pending: "Pending review",
  approved: "Queued to send",
  sent: "Sent",
  rejected: "Rejected",
  discarded: "Discarded",
  expired: "Expired",
  failed: "Send failed",
};

export const FOLLOW_UP_CHANNEL_LABELS: Record<FollowUpChannel, string> = {
  sms: "SMS",
  email: "Email",
};

export const QUALITY_FAILURE_LABELS: Record<Enums<"follow_up_quality_failure">, string> = {
  banned_phrase: "Banned phrase",
  unverified_quote: "Quote not in the transcript",
  ungrounded_topic: "Topic the prospect did not raise",
  no_lead_specific: "Nothing specific to this call",
  length: "Over the channel length target",
  greeting: "Greeting the voice profile excludes",
  signoff: "Sign-off the voice profile excludes",
};

export const HALT_REASON_LABELS: Record<Enums<"follow_up_halt_reason">, string> = {
  inbound_reply: "Inbound reply",
  appointment_booked: "Appointment booked",
  payment: "Payment recorded",
  status_closed: "Marked closed",
  status_not_interested: "Marked not interested",
  operator: "Halted by operator",
  org_stop: "Sequences stopped for the workspace",
  max_length: "Sequence reached its maximum length",
  max_duration: "Sequence reached its maximum duration",
  new_call: "A newer call replaced it",
  suppressed: "Contact is suppressed",
};
