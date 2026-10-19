import { AGENTS } from "@/lib/agents/roster";

/**
 * Task rules that do not touch the database. Completing a task never logs a
 * touch. One open task per lead, source, and purpose.
 */

export const TASK_TYPES = ["call", "follow_up", "prepare", "review", "other"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["suggested", "open", "snoozed", "done", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SOURCES = ["person", "sentry", "scribe", "playbook", "booking", "service_team"] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

export const OPEN_TASK_STATUSES: TaskStatus[] = ["suggested", "open", "snoozed"];

const CALL_START_HOUR = 8;
const CALL_END_HOUR = 20;

export function isOpenStatus(status: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(status);
}

export function purposeKey(source: TaskSource, purpose: string): string {
  const cleaned = purpose.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  return `${source}:${cleaned}`;
}

export type TaskDraft = {
  leadId: string | null;
  source: TaskSource;
  purpose: string;
  title: string;
  status: TaskStatus;
};

export type ExistingTask = TaskDraft & { id: string };

/** A newer suggestion updates the open row with the same purpose. It does not add a second one. */
export function matchOpenTask(existing: ExistingTask[], draft: Pick<TaskDraft, "leadId" | "source" | "purpose">): ExistingTask | null {
  const key = purposeKey(draft.source, draft.purpose);
  return (
    existing.find(
      (row) =>
        row.leadId === draft.leadId &&
        isOpenStatus(row.status) &&
        purposeKey(row.source, row.purpose) === key
    ) ?? null
  );
}

export function initialStatus(source: TaskSource, agentTasks: "suggested" | "direct"): TaskStatus {
  if (source === "person" || source === "service_team") return "open";
  return agentTasks === "direct" ? "open" : "suggested";
}

/** Completing a task is not a human touch. A touch is a separate logged outcome. */
export function completionLogsTouch(): false {
  return false;
}

export type TouchChoice = "connected" | "left_voicemail" | "no_answer" | "texted" | "emailed";

export const TOUCH_CHOICES: Array<{ value: TouchChoice; label: string }> = [
  { value: "connected", label: "Call connected" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "no_answer", label: "No answer" },
  { value: "texted", label: "Texted" },
  { value: "emailed", label: "Emailed" },
];

function hourInZone(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(at);
  const hour = parts.find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0");
}

export function outsideCallingHours(at: Date, timeZone: string): boolean {
  try {
    const hour = hourInZone(at, timeZone);
    return hour < CALL_START_HOUR || hour >= CALL_END_HOUR;
  } catch {
    return false;
  }
}

export function callingHoursWarning(at: Date, timeZone: string): string | null {
  if (!outsideCallingHours(at, timeZone)) return null;
  return "This lead's local time is outside normal calling hours (before 8 am or after 8 pm). You can still call, or move the task.";
}

/** Next 8:00 in the lead's zone. A warning, not a block. */
export function nextSuitableCall(at: Date, timeZone: string): Date {
  const probe = new Date(at.getTime());
  for (let i = 0; i < 48; i += 1) {
    if (!outsideCallingHours(probe, timeZone)) return probe;
    probe.setTime(probe.getTime() + 30 * 60 * 1000);
  }
  return probe;
}

export function dueChoice(choice: "later_today" | "tomorrow_morning" | "in_3_days", now: Date): Date {
  const next = new Date(now.getTime());
  if (choice === "later_today") {
    next.setTime(now.getTime() + 4 * 60 * 60 * 1000);
    return next;
  }
  if (choice === "tomorrow_morning") {
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    return next;
  }
  next.setDate(next.getDate() + 3);
  next.setHours(9, 0, 0, 0);
  return next;
}

export function sourceSentence(source: TaskSource, because: string): string {
  const reason = because.trim();
  switch (source) {
    case "sentry":
      return reason ? `Suggested by ${AGENTS.sentry.name} because ${reason}` : `Suggested by ${AGENTS.sentry.name}`;
    case "scribe":
      return reason ? `Suggested by ${AGENTS.scribe.name} because ${reason}` : `Suggested by ${AGENTS.scribe.name}`;
    case "playbook":
      return reason ? `From a play: ${reason}` : "From a play";
    case "booking":
      return reason ? `From a booking: ${reason}` : "From a booking";
    case "service_team":
      return reason ? `From the Vistrial team: ${reason}` : "From the Vistrial team";
    default:
      return reason ? `Added by a person: ${reason}` : "Added by a person";
  }
}

export function taskReminderCopy(kind: "due" | "overdue" | "suggested" | "assigned"): { title: string; body: string } {
  if (kind === "overdue") return { title: "Task overdue", body: "A task is overdue. Open Vistrial to see it." };
  if (kind === "suggested") return { title: "Suggested task waiting", body: "A suggested task is waiting for you." };
  if (kind === "assigned") return { title: "Task assigned to you", body: "A task was handed to you." };
  return { title: "Task due", body: "A task is due. Open Vistrial to see it." };
}
