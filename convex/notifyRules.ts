export const HOURLY_CAP = 8;
export const WORKSPACE_HOURLY_CAP = 200;
export const GROUP_WINDOW_MS = 15 * 60 * 1000;
export const DIGEST_LOCAL_HOUR = 8;
export const DIGEST_WINDOW_MINUTES = 15;

const EXEMPT = new Set(["billing_issue"]);
const CRITICAL = new Set(["ingestion_stalled", "crm_broken"]);

export function shouldGroup(eventType: string): boolean {
  if (CRITICAL.has(eventType) || EXEMPT.has(eventType)) return false;
  return true;
}

export function interruptCapped(args: {
  personCount: number;
  workspaceCount: number;
  eventType: string;
  isTest: boolean;
}): "send" | "summarize" {
  if (args.isTest || EXEMPT.has(args.eventType)) return "send";
  if (args.personCount >= HOURLY_CAP || args.workspaceCount >= WORKSPACE_HOURLY_CAP) return "summarize";
  return "send";
}

function zoned(at: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: pick("year"), month: pick("month"), day: pick("day"), hour: pick("hour"), minute: pick("minute") };
}

export function localDateKey(at: Date, timeZone: string): string {
  const parts = zoned(at, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

/** Daily digest is due once, at 8:00 local time, inside a 15-minute window. */
export function digestDue(at: Date, timeZone: string, alreadySentOn: string | null): boolean {
  const parts = zoned(at, timeZone);
  const minutes = parts.hour * 60 + parts.minute - DIGEST_LOCAL_HOUR * 60;
  if (minutes < 0 || minutes >= DIGEST_WINDOW_MINUTES) return false;
  return alreadySentOn !== localDateKey(at, timeZone);
}

export function sideEffectsBlocked(flags: {
  historic?: boolean;
  duplicate?: boolean;
  replay?: boolean;
  pausedCatchup?: boolean;
  occurredBeforeGoLive?: boolean;
  imported?: boolean;
}): boolean {
  return Boolean(
    flags.historic || flags.duplicate || flags.replay || flags.pausedCatchup || flags.occurredBeforeGoLive || flags.imported,
  );
}
