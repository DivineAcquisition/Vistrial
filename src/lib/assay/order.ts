import type { QueueOrderMode } from "@/lib/assay/types";

export type WorkItem = {
  id: string;
  /** Lower is more urgent. Sentry obligations use the lowest ranks. */
  urgencyRank: number;
  score: number;
  waitingSince: string;
  doNotContact: boolean;
  assigneeId?: string | null;
};

function byWait(a: WorkItem, b: WorkItem): number {
  const wait = Date.parse(a.waitingSince) - Date.parse(b.waitingSince);
  if (wait !== 0) return wait;
  return a.id.localeCompare(b.id);
}

function compare(mode: QueueOrderMode) {
  return (a: WorkItem, b: WorkItem): number => {
    if (a.urgencyRank !== b.urgencyRank) return a.urgencyRank - b.urgencyRank;
    if (mode === "best" && a.score !== b.score) return b.score - a.score;
    return byWait(a, b);
  };
}

/** Outreach queues. Do-not-contact leads are left out. Order never changes who owns a lead. */
export function orderOutreach<T extends WorkItem>(items: readonly T[], mode: QueueOrderMode): T[] {
  return items.filter((item) => !item.doNotContact).sort(compare(mode));
}

/** A full list. Do-not-contact leads stay visible and sort after everyone else at the same urgency. */
export function orderIncludingConsent<T extends WorkItem>(items: readonly T[], mode: QueueOrderMode): T[] {
  return [...items].sort((a, b) => {
    if (a.doNotContact !== b.doNotContact) return a.doNotContact ? 1 : -1;
    return compare(mode)(a, b);
  });
}
