import { plural } from "@/lib/home/areas/types";
import { actionType, queueKind } from "@/lib/home/catalog";

/**
 * The approval queue and the activity log, as plain data. Database reads and
 * writes live in `queue-server.ts`; everything here is pure so the rules are
 * testable without a database.
 */

export const QUEUE_OPEN_STATUSES = ["pending", "running", "failed"] as const;
export type QueueStatus = "pending" | "running" | "failed" | "succeeded" | "dismissed";

export type DraftChannel = "sms" | "email" | "task";

export type DraftResult = {
  status: "sent" | "scheduled" | "failed" | "skipped";
  reason?: string | null;
  at: string;
  /** For a scheduled message, when it goes out. */
  sendAt?: string | null;
};

/** One lead's part of an item: the message that would go out, or the task. */
export type QueueDraft = {
  leadId: string;
  leadName: string;
  channel: DraftChannel;
  subject: string | null;
  body: string;
  /** The no-show appointment this rebooks, so it is never drafted twice. */
  callId?: string | null;
  result?: DraftResult | null;
};

/** Most leads a single queue item carries. Past this a second item is made. */
export const MAX_LEADS_PER_ITEM = 25;

export function isDone(draft: QueueDraft): boolean {
  return draft.result?.status === "sent" || draft.result?.status === "scheduled" || draft.result?.status === "skipped";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseDrafts(value: unknown): QueueDraft[] {
  if (!Array.isArray(value)) return [];
  const drafts: QueueDraft[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const leadId = asString(row.leadId);
    const body = typeof row.body === "string" ? row.body : null;
    const channel = row.channel === "sms" || row.channel === "email" || row.channel === "task" ? row.channel : null;
    if (!leadId || body === null || !channel) continue;
    const result = row.result && typeof row.result === "object" ? (row.result as Record<string, unknown>) : null;
    const status = result?.status;
    drafts.push({
      leadId,
      leadName: asString(row.leadName) ?? "Unnamed lead",
      channel,
      subject: asString(row.subject),
      body,
      callId: asString(row.callId),
      result:
        status === "sent" || status === "scheduled" || status === "failed" || status === "skipped"
          ? {
              status,
              reason: asString(result?.reason),
              at: asString(result?.at) ?? new Date(0).toISOString(),
              sendAt: asString(result?.sendAt),
            }
          : null,
    });
  }
  return drafts;
}

/* ---------------------------------------------------------------------------
 * Drafting
 * ------------------------------------------------------------------------- */

export type VoiceBits = {
  greeting: string | null;
  signoff: string | null;
  /** False when the workspace turned greetings off: the message starts with its first sentence. */
  useGreeting?: boolean;
};

function frame(body: string, voice: VoiceBits, firstName: string | null): string {
  const bye = voice.signoff ? `\n\n${voice.signoff.trim()}` : "";
  if (voice.useGreeting === false) return `${body.charAt(0).toUpperCase()}${body.slice(1)}${bye}`;
  const hello = voice.greeting
    ? `${voice.greeting.replace(/\{name\}/gi, firstName ?? "there").trim()} `
    : `Hi ${firstName ?? "there"}, `;
  return `${hello}${body}${bye}`;
}

export function quietLeadDraft(args: {
  firstName: string | null;
  offerName: string | null;
  channel: "sms" | "email";
  voice: VoiceBits;
}): { subject: string | null; body: string } {
  const topic = args.offerName ? ` about ${args.offerName}` : "";
  return {
    subject: args.channel === "email" ? "Checking in" : null,
    body: frame(
      `just checking in${topic}. Is this still something you want help with? Happy to find a time that works for you.`,
      args.voice,
      args.firstName
    ),
  };
}

export function noShowDraft(args: {
  firstName: string | null;
  channel: "sms" | "email";
  voice: VoiceBits;
}): { subject: string | null; body: string } {
  return {
    subject: args.channel === "email" ? "Let's find a new time" : null,
    body: frame(
      "sorry we missed each other on the call. Want to pick a new time? Reply here and we will get you booked in.",
      args.voice,
      args.firstName
    ),
  };
}

export function waitedLabel(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

export function nudgeText(args: { leadName: string; waitedMinutes: number; windowMinutes: number }): string {
  return `Reach out to ${args.leadName}. They have waited ${waitedLabel(args.waitedMinutes)} with no reply, past your ${waitedLabel(
    args.windowMinutes
  )} response window.`;
}

/** Channel for a message: text if there is a phone number, email if not, nothing if neither. */
export function messageChannel(lead: { phone: string | null; email: string | null }): "sms" | "email" | null {
  if (lead.phone?.trim()) return "sms";
  if (lead.email?.trim()) return "email";
  return null;
}

/* ---------------------------------------------------------------------------
 * Item copy
 * ------------------------------------------------------------------------- */

export function itemTitle(kind: string, count: number, extra: { assigneeName?: string | null; windowMinutes?: number } = {}): string {
  if (kind === "quiet_lead_follow_up") return `Follow up with ${plural(count, "lead", "leads")} quiet for 48h+`;
  if (kind === "no_show_rebook") return `Rebook ${plural(count, "no-show", "no-shows")}`;
  if (kind === "untouched_lead_nudge") {
    const who = extra.assigneeName ?? "the team";
    const window = extra.windowMinutes ? ` past your ${waitedLabel(extra.windowMinutes)} window` : "";
    return `Nudge ${who} about ${plural(count, "new lead", "new leads")} waiting${window}`;
  }
  return queueKind(kind)?.label ?? "Waiting on you";
}

export function itemPreview(drafts: QueueDraft[]): string {
  const first = drafts[0];
  if (!first) return "";
  const text = first.body.replace(/\s+/g, " ").trim();
  const clipped = text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
  return first.channel === "task" ? clipped : `To ${first.leadName}: “${clipped}”`;
}

/* ---------------------------------------------------------------------------
 * Ordering
 * ------------------------------------------------------------------------- */

export type SortableItem = {
  kind: string;
  createdAt: string;
  escalatedAt: string | null;
};

/**
 * Untouched new leads first, then no-shows, then quiet leads. Within a kind,
 * escalated items first, then the one that has waited longest.
 */
export function sortQueue<T extends SortableItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const urgency = (queueKind(a.kind)?.urgency ?? 99) - (queueKind(b.kind)?.urgency ?? 99);
    if (urgency !== 0) return urgency;
    const escalated = Number(Boolean(b.escalatedAt)) - Number(Boolean(a.escalatedAt));
    if (escalated !== 0) return escalated;
    return Date.parse(a.createdAt) - Date.parse(b.createdAt);
  });
}

/* ---------------------------------------------------------------------------
 * Activity log
 * ------------------------------------------------------------------------- */

export type ActivityEvent = {
  id: string;
  actionType: string;
  occurredAt: string;
  runMode: "auto_run" | "approved";
  approvedByMemberId: string | null;
  approvedByName: string | null;
  count: number;
  leadIds: string[];
};

export type ActivityEntry = {
  key: string;
  actionType: string;
  description: string;
  runMode: "auto_run" | "approved";
  approvedByName: string | null;
  /** The newest event in the group. */
  at: string;
  count: number;
  leadIds: string[];
};

/** Similar actions closer together than this collapse into one line. */
export const ACTIVITY_GROUP_WINDOW_MS = 30 * 60_000;

/**
 * Newest first. Events of the same action type, run the same way by the same
 * person, each within half an hour of the next, become one line, even when
 * something else happened in between.
 */
export function groupActivity(events: ActivityEvent[], windowMs = ACTIVITY_GROUP_WINDOW_MS): ActivityEntry[] {
  const sorted = [...events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const groups: Array<{ entry: ActivityEntry; oldest: number }> = [];
  for (const event of sorted) {
    const at = Date.parse(event.occurredAt);
    const last = groups.find(
      (group) =>
        group.entry.actionType === event.actionType &&
        group.entry.runMode === event.runMode &&
        group.entry.approvedByName === event.approvedByName &&
        group.oldest - at <= windowMs
    );
    if (last) {
      last.entry.count += event.count;
      last.entry.leadIds = [...new Set([...last.entry.leadIds, ...event.leadIds])];
      last.oldest = at;
      continue;
    }
    groups.push({
      oldest: at,
      entry: {
        key: event.id,
        actionType: event.actionType,
        description: "",
        runMode: event.runMode,
        approvedByName: event.approvedByName,
        at: event.occurredAt,
        count: event.count,
        leadIds: [...event.leadIds],
      },
    });
  }
  return groups.map(({ entry }) => ({
    ...entry,
    description: actionType(entry.actionType)?.describeDone(entry.count) ?? `Handled ${plural(entry.count, "item", "items")}`,
  }));
}

export function runModeLabel(entry: Pick<ActivityEntry, "runMode" | "approvedByName">): string {
  if (entry.runMode === "auto_run") return "Auto-run";
  return entry.approvedByName ? `Approved by ${entry.approvedByName}` : "Approved";
}
