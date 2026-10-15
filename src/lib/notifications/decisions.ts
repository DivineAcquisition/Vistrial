import { categoryForEvent } from "@/lib/email/category";
import {
  NOTIFICATION_BATCH_WINDOW_MS,
  NOTIFICATION_HOURLY_CAP,
  NOTIFICATION_WORKSPACE_HOURLY_CAP,
} from "@/lib/notifications/constants";

/** Account, security, and billing mail skip caps and grouping. */
const EXEMPT_CATEGORIES = new Set(["A", "A2", "B"]);

/** Product events that map to those categories. Auth mail does not use this queue. */
export const LIMIT_EXEMPT_EVENTS = ["billing_issue"] as const;

export function isCriticalEvent(eventType: string): boolean {
  return eventType === "ingestion_stalled" || eventType === "crm_broken";
}

export function exemptFromLimits(eventType: string): boolean {
  if ((LIMIT_EXEMPT_EVENTS as readonly string[]).includes(eventType)) return true;
  const category = categoryForEvent(eventType);
  return category !== null && EXEMPT_CATEGORIES.has(category);
}

/** Related non-critical alerts can share a 15-minute window. Critical alerts cannot. */
export function shouldGroup(eventType: string): boolean {
  if (isCriticalEvent(eventType)) return false;
  if (exemptFromLimits(eventType)) return false;
  return true;
}

export function groupHoldUntil(now: Date, eventType: string, hasBatch: boolean): Date | null {
  if (!hasBatch || !shouldGroup(eventType)) return null;
  return new Date(now.getTime() + NOTIFICATION_BATCH_WINDOW_MS);
}

/**
 * Over the person or workspace cap, the notice is summarized.
 * Critical notices are included in that summary. They are not discarded.
 * Account and billing notices are not counted.
 */
export function interruptCapped(args: {
  personCount: number;
  workspaceCount: number;
  eventType: string;
  isTest: boolean;
}): "send" | "summarize" {
  if (args.isTest || exemptFromLimits(args.eventType)) return "send";
  if (args.personCount >= NOTIFICATION_HOURLY_CAP) return "summarize";
  if (args.workspaceCount >= NOTIFICATION_WORKSPACE_HOURLY_CAP) return "summarize";
  return "send";
}
