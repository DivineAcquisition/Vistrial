import type { NotificationEventType } from "@/lib/notifications/types";

/**
 * Part 1 of Prompt 13. A type that fails either test is not built.
 *
 * saturday9pm: would they want to be interrupted at 9pm on a Saturday?
 * If false, the event is not urgent: email/digest, or push that defers to
 * working hours. Only ingestion_stalled and crm_broken override quiet hours.
 */
export type CatalogEntry = {
  type: NotificationEventType;
  canActNow: boolean;
  saturday9pm: boolean;
  why: string;
};

export const NOTIFICATION_CATALOG: CatalogEntry[] = [
  {
    type: "speed_to_lead",
    canActNow: true,
    saturday9pm: false,
    why: "Assigned setter can touch the lead now. Deferred outside working hours.",
  },
  {
    type: "unassigned_ready",
    canActNow: true,
    saturday9pm: false,
    why: "A setter can take ownership now. Deferred outside working hours.",
  },
  {
    type: "approaching_ghost",
    canActNow: true,
    saturday9pm: false,
    why: "Owner can work the case. Daily email digest, never a push.",
  },
  {
    type: "pending_draft",
    canActNow: true,
    saturday9pm: false,
    why: "Approver can approve or regenerate now. Deferred outside working hours.",
  },
  {
    type: "call_starting_soon",
    canActNow: true,
    saturday9pm: false,
    why: "Closer can open the brief. Skipped if the call falls outside working hours rather than waking them.",
  },
  {
    type: "unmatched_transcript",
    canActNow: true,
    saturday9pm: false,
    why: "Admin can match or discard. Digest unless the backlog crosses the threshold.",
  },
  {
    type: "ingestion_stalled",
    canActNow: true,
    saturday9pm: true,
    why: "Admin can restore ingest. The business is accumulating nothing. Quiet-hours exception.",
  },
  {
    type: "crm_broken",
    canActNow: true,
    saturday9pm: true,
    why: "Admin can reconnect. Dispatch has halted. Quiet-hours exception.",
  },
  {
    type: "job_failure",
    canActNow: true,
    saturday9pm: false,
    why: "Staff-only DA console. Clients never see infrastructure noise.",
  },
  {
    type: "adoption_warning",
    canActNow: true,
    saturday9pm: false,
    why: "Owner can coach the team. Weekly email, never a push.",
  },
  {
    type: "daily_brief",
    canActNow: true,
    saturday9pm: false,
    why: "Start-of-day email with links into the work. Skipped when empty.",
  },
  {
    type: "hourly_summary",
    canActNow: true,
    saturday9pm: false,
    why: "Overflow of a cap, not a new class of alarm. Open the queue.",
  },
  {
    type: "test_send",
    canActNow: true,
    saturday9pm: false,
    why: "Requested from settings so a broken channel is found during onboarding.",
  },
  {
    type: "help_request",
    canActNow: true,
    saturday9pm: false,
    why: "Staff can answer the customer. Email to the team, never a push to the customer.",
  },
  {
    type: "help_reply",
    canActNow: true,
    saturday9pm: false,
    why: "The person who asked can read the answer. Email and the notifications page.",
  },
  {
    type: "export_ready",
    canActNow: true,
    saturday9pm: false,
    why: "The person who asked for the export can download it. Email and the notifications page.",
  },
  {
    type: "billing_issue",
    canActNow: true,
    saturday9pm: false,
    why: "An owner can update the payment method. Email only. Nothing is switched off.",
  },
  {
    type: "data_request",
    canActNow: true,
    saturday9pm: false,
    why: "Staff can start the export or deletion the owner asked for. Email to the team.",
  },
  {
    type: "workspace_notice",
    canActNow: true,
    saturday9pm: false,
    why: "The Vistrial team paused an agent or found something an owner should fix. Email and the notifications page.",
  },
  {
    type: "onboarding",
    canActNow: true,
    saturday9pm: false,
    why: "A setup step needs the owner, or the team finished something. Grouped, limited, and never about a lead. Email and the notifications page.",
  },
  { type: "task_assigned", canActNow: true, saturday9pm: false, why: "The person can open the task. Deferred outside working hours." },
  { type: "task_due", canActNow: true, saturday9pm: false, why: "The person can do the task. Generic copy, no lead content." },
  { type: "task_overdue", canActNow: true, saturday9pm: false, why: "One grouped nudge. No lead content." },
  { type: "task_suggested", canActNow: true, saturday9pm: false, why: "The person can accept or dismiss. No lead content." },
  { type: "lead_assigned", canActNow: true, saturday9pm: false, why: "The person can open the lead. Generic copy." },
  { type: "lead_to_claim", canActNow: true, saturday9pm: false, why: "An eligible person can claim. Generic copy." },
  { type: "lead_reassigned", canActNow: true, saturday9pm: false, why: "The people involved can see the change. Generic copy." },
  { type: "routing_nobody", canActNow: true, saturday9pm: false, why: "An owner can assign by hand. Generic copy." },
  { type: "away_holds_leads", canActNow: true, saturday9pm: false, why: "An owner can reassign. Email, not a push by default." },
  { type: "claim_timer_expired", canActNow: true, saturday9pm: false, why: "An owner can claim or assign. Off unless the timer is set." },
  { type: "stale_reassign", canActNow: true, saturday9pm: false, why: "A recommendation unless automatic reassignment is on. Generic copy." },
  { type: "team_workload", canActNow: true, saturday9pm: false, why: "An owner can open the task list. Counts only, not a ranking." },
  { type: "push_device", canActNow: true, saturday9pm: false, why: "Security notice that a device was added or removed. Email." },
  { type: "install_help", canActNow: true, saturday9pm: false, why: "Optional help. Never asked on the first visit." },
  {
    type: "report_ready",
    canActNow: true,
    saturday9pm: false,
    why: "The owner can open a scheduled report. Email with counts only, no lead names.",
  },
  {
    type: "export_failed",
    canActNow: true,
    saturday9pm: false,
    why: "The person who asked can try the export again. Email, no file contents.",
  },
  {
    type: "export_expiring",
    canActNow: true,
    saturday9pm: false,
    why: "The person who asked can download before the file is deleted. Email, no file contents.",
  },
  {
    type: "api_key_notice",
    canActNow: true,
    saturday9pm: false,
    why: "The owner can review or revoke a key. Email, never the secret.",
  },
  {
    type: "webhook_notice",
    canActNow: true,
    saturday9pm: false,
    why: "The owner can fix or turn a webhook back on. Email, no payload contents.",
  },
  {
    type: "client_report_review",
    canActNow: true,
    saturday9pm: false,
    why: "A Vistrial team member can review the draft before it is released. Nothing sends to the customer until then.",
  },
  { type: "assay_hot", canActNow: true, saturday9pm: false, why: "The owner can call a lead that became Hot. Push, deferred outside working hours." },
  { type: "assay_jump", canActNow: true, saturday9pm: false, why: "The owner can open a lead whose score jumped. Normal delivery, grouped." },
  { type: "assay_quiet", canActNow: true, saturday9pm: false, why: "The owner can reach a Hot lead who has gone quiet. Normal delivery, grouped." },
  { type: "assay_no_show", canActNow: true, saturday9pm: false, why: "The owner can reschedule a missed booking. Push, deferred outside working hours." },
  { type: "assay_summary", canActNow: true, saturday9pm: false, why: "The daily task cap grouped the rest. Open the queue." },
];
