import type { ActivityEvent, ActivityLine } from "@/lib/activity/types";

const NEVER_BATCH_KINDS = new Set([
  "dispatch_sent",
  "dispatch_failed",
  "dispatch_queued",
  "draft_approved",
]);

const BATCHABLE_KINDS = new Set([
  "lead_received",
  "contact_updated",
  "opportunity_updated",
  "webhook_other",
]);

export function canBatchActivity(event: ActivityEvent): boolean {
  if (event.result === "failed") return false;
  if (event.category === "user" || event.category === "agent" || event.category === "operator") {
    return false;
  }
  if (NEVER_BATCH_KINDS.has(event.kind)) return false;
  return BATCHABLE_KINDS.has(event.kind);
}

function batchHeadline(kind: string, count: number): string {
  if (kind === "lead_received") {
    return count === 1 ? "1 lead arrived" : `${count} leads arrived`;
  }
  if (kind === "contact_updated") {
    return count === 1 ? "1 contact updated" : `${count} contacts updated`;
  }
  if (kind === "opportunity_updated") {
    return count === 1 ? "1 opportunity updated" : `${count} opportunities updated`;
  }
  return count === 1 ? "1 event" : `${count} events`;
}

/**
 * Collapse high-frequency sync/arrival rows of the same category and kind.
 * Failures, dispatches, and user/agent/operator actions stay one line each.
 * Groups never merge across categories.
 */
export function batchActivityEvents(events: ActivityEvent[]): ActivityLine[] {
  const groups = new Map<string, ActivityEvent[]>();
  const order: string[] = [];

  for (const event of events) {
    if (!canBatchActivity(event)) {
      const key = `single:${event.id}`;
      groups.set(key, [event]);
      order.push(key);
      continue;
    }
    const key = `batch:${event.category}:${event.kind}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
      order.push(key);
    }
  }

  const lines: ActivityLine[] = order.map((key) => {
    const group = groups.get(key) ?? [];
    const first = group[0];
    if (!first) {
      return { type: "single", event: events[0]! };
    }
    if (group.length === 1 || key.startsWith("single:")) {
      return { type: "single", event: first };
    }
    const latest = group.reduce((a, b) => (a.occurredAt >= b.occurredAt ? a : b));
    return {
      type: "batch",
      key,
      category: first.category,
      kind: first.kind,
      headline: batchHeadline(first.kind, group.length),
      occurredAt: latest.occurredAt,
      events: group,
    };
  });

  return lines.sort((a, b) => {
    const aAt = a.type === "single" ? a.event.occurredAt : a.occurredAt;
    const bAt = b.type === "single" ? b.event.occurredAt : b.occurredAt;
    if (aAt === bAt) return 0;
    return aAt > bAt ? -1 : 1;
  });
}
