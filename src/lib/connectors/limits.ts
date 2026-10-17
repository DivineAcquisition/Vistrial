export type LimitRow = {
  connectorKey: string;
  status: string;
  countsTowardLimit: boolean;
  limitGroup: string | null;
};

/**
 * Named connections that count. A calendar group counts once, no matter how
 * many people connect a calendar. Each other account counts on its own.
 * Webhook, file upload, and manual entry do not count.
 * Disconnected rows do not count.
 */
export function slotsUsed(rows: readonly LimitRow[]): number {
  const active = rows.filter((row) => row.countsTowardLimit && row.status !== "disconnected");
  const grouped = new Set(active.map((row) => row.limitGroup).filter((group): group is string => Boolean(group)));
  const singles = active.filter((row) => !row.limitGroup).length;
  return singles + grouped.size;
}

export function limitAllows(args: {
  rows: readonly LimitRow[];
  limit: number | null;
  adding: LimitRow;
}): { allowed: boolean; used: number; limit: number | null } {
  const used = slotsUsed(args.rows);
  if (!args.adding.countsTowardLimit || args.adding.status === "disconnected") {
    return { allowed: true, used, limit: args.limit };
  }
  const next = slotsUsed([...args.rows, args.adding]);
  if (next === used) return { allowed: true, used, limit: args.limit };
  if (args.limit === null) return { allowed: true, used, limit: null };
  return { allowed: next <= args.limit, used, limit: args.limit };
}
