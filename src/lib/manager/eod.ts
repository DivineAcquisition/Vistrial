/**
 * End of day reports, drafted from a rep's real activity. Counts only: no
 * message, call or note text is read or stored. Every number traces back to
 * rows the rep created that day in the workspace's time zone.
 */

export type ActivityRows = {
  touches: Array<{
    actor_member_id: string | null;
    channel: string;
    direction: string;
    type: string;
    outcome: string | null;
    occurred_at: string;
  }>;
  calls: Array<{ ran_by_member_id: string | null; outcome: string | null; occurred_at: string | null }>;
  statusChanges: Array<{ actor_member_id: string | null; to_status: string; created_at: string }>;
  tasksDone: Array<{ owner_member_id: string | null; completed_at: string | null }>;
};

export const EOD_METRICS = ["dials", "conversations", "followUps", "booked", "callsHeld", "noShows", "closes", "tasksDone"] as const;
export type EodMetric = (typeof EOD_METRICS)[number];
export type EodActivity = Record<EodMetric, number>;

export const EOD_LABEL: Record<EodMetric, string> = {
  dials: "Calls made",
  conversations: "Conversations",
  followUps: "Follow-ups sent",
  booked: "Calls booked",
  callsHeld: "Sales calls held",
  noShows: "No-shows",
  closes: "Closes",
  tasksDone: "Tasks done",
};

export function emptyActivity(): EodActivity {
  return { dials: 0, conversations: 0, followUps: 0, booked: 0, callsHeld: 0, noShows: 0, closes: 0, tasksDone: 0 };
}

function inWindow(iso: string | null, start: number, end: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return at >= start && at < end;
}

/** One activity record per rep for the window [start, end). Reps with nothing still get a zero row. */
export function eodActivity(rows: ActivityRows, memberIds: string[], window: { start: string; end: string }): Map<string, EodActivity> {
  const start = Date.parse(window.start);
  const end = Date.parse(window.end);
  const out = new Map(memberIds.map((id) => [id, emptyActivity()]));
  const bump = (id: string | null, metric: EodMetric) => {
    if (!id) return;
    const row = out.get(id);
    if (row) row[metric] += 1;
  };
  for (const touch of rows.touches) {
    if (touch.type !== "human" || !inWindow(touch.occurred_at, start, end)) continue;
    if (touch.direction === "outbound" && (touch.channel === "call" || touch.channel === "voicemail")) bump(touch.actor_member_id, "dials");
    if (touch.direction === "outbound" && (touch.channel === "sms" || touch.channel === "email" || touch.channel === "dm")) bump(touch.actor_member_id, "followUps");
    if (touch.outcome === "connected" || touch.outcome === "replied") bump(touch.actor_member_id, "conversations");
    if (touch.outcome === "booked") bump(touch.actor_member_id, "booked");
  }
  for (const call of rows.calls) {
    if (!inWindow(call.occurred_at, start, end)) continue;
    if (call.outcome === "held") bump(call.ran_by_member_id, "callsHeld");
    if (call.outcome === "no_show") bump(call.ran_by_member_id, "noShows");
  }
  for (const change of rows.statusChanges) {
    if (change.to_status === "closed_won" && inWindow(change.created_at, start, end)) bump(change.actor_member_id, "closes");
  }
  for (const task of rows.tasksDone) {
    if (inWindow(task.completed_at, start, end)) bump(task.owner_member_id, "tasksDone");
  }
  return out;
}

function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - at;
}

/** Midnight to midnight of a local day, as UTC instants. */
export function dayWindow(day: string, timeZone: string): { start: string; end: string } {
  const [y, m, d] = day.split("-").map(Number);
  const local = (year: number, month: number, date: number) => {
    const guess = Date.UTC(year, month - 1, date);
    let at = guess - zoneOffsetMs(guess, timeZone);
    at = guess - zoneOffsetMs(at, timeZone);
    return at;
  };
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    start: new Date(local(y, m, d)).toISOString(),
    end: new Date(local(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())).toISOString(),
  };
}

export function localDay(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

export function localMinutes(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** EODs are drafted once the business day has ended (decision 5). */
export function businessDayOver(at: number, timeZone: string, endHm: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(endHm);
  const end = match ? Number(match[1]) * 60 + Number(match[2]) : 18 * 60;
  return localMinutes(at, timeZone) >= end;
}
