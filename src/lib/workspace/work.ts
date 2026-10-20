import type { Tier } from "@/lib/workspace/voice";

/**
 * Ordering for Due now, Work next, and tasks. Pure and client-safe. Due now
 * follows Sentry's clock state so the label and the position always agree,
 * and it always sits above Work next, whatever the scores say.
 */

export type DueRow = {
  leadId: string;
  name: string;
  phone: string | null;
  kind: "first_touch" | "follow_up";
  state: "missed" | "at_risk";
  deadlineAt: string | null;
  reason: string | null;
  tier: Tier | null;
};

export type WorkRow = {
  leadId: string;
  name: string;
  phone: string | null;
  tier: Tier;
  score: number;
  reason: string | null;
  createdAt: string;
};

export type TaskRow = {
  id: string;
  text: string;
  dueAt: string;
  source: string;
  leadId: string | null;
  leadName: string | null;
  snoozed: boolean;
};

const FAR = Number.MAX_SAFE_INTEGER;

/** Late first, most late at the top; then the windows closing soonest. */
export function orderDueNow(rows: DueRow[]): DueRow[] {
  return [...rows].sort((a, b) => {
    if (a.state !== b.state) return a.state === "missed" ? -1 : 1;
    const da = a.deadlineAt ? Date.parse(a.deadlineAt) : FAR;
    const db = b.deadlineAt ? Date.parse(b.deadlineAt) : FAR;
    return da - db || a.leadId.localeCompare(b.leadId);
  });
}

export function orderWorkNext(rows: WorkRow[], mode: "best" | "oldest"): WorkRow[] {
  return [...rows].sort((a, b) => {
    if (mode === "oldest") return a.createdAt.localeCompare(b.createdAt) || a.leadId.localeCompare(b.leadId);
    return b.score - a.score || a.createdAt.localeCompare(b.createdAt) || a.leadId.localeCompare(b.leadId);
  });
}

/** Overdue first, then by due time. */
export function sortTasks(rows: TaskRow[], now: number): TaskRow[] {
  return [...rows].sort((a, b) => {
    const lateA = Date.parse(a.dueAt) < now && !a.snoozed;
    const lateB = Date.parse(b.dueAt) < now && !b.snoozed;
    if (lateA !== lateB) return lateA ? -1 : 1;
    return a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id);
  });
}

/**
 * Rows never move under the person's cursor. Keep what is on screen in its
 * place (dropping rows that are gone), and report how many new rows are
 * waiting behind a "New items available" control.
 */
export function holdOrder<T>(shownIds: string[], incoming: T[], key: (row: T) => string): { rows: T[]; waiting: number } {
  const byId = new Map(incoming.map((row) => [key(row), row]));
  const rows = shownIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const shown = new Set(shownIds);
  const waiting = incoming.filter((row) => !shown.has(key(row))).length;
  return { rows, waiting };
}
