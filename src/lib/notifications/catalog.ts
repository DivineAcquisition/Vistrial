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
];
