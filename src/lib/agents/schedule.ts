/**
 * Scheduled runs fire in the org timezone, not UTC-as-local.
 */
export function scheduledRunInstant(args: {
  timezone: string;
  nowUtc: Date;
}): { timezone: string; instant: Date } {
  return { timezone: args.timezone || "America/New_York", instant: args.nowUtc };
}

export function isDueInOrgTimezone(args: {
  timezone: string;
  nowUtc: Date;
  hour: number;
  minute: number;
}): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: args.timezone || "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(args.nowUtc);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? -1);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? -1);
  return hour === args.hour && minute === args.minute;
}
