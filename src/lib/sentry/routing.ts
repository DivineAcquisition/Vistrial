import { countedChannel } from "@/lib/sentry/clock";

/**
 * Who hears about an alert, how, and when. Every rule comes from the
 * escalation settings; nothing here knows about a particular business.
 */

export type EscalationLevel = {
  severity: string;
  after_windows: number;
  notify: string[];
  channels: string[];
};

export type RouteTarget = { memberId: string; userId: string };

export type RouteContext<T extends RouteTarget> = {
  assignee: T | null;
  setters: T[];
  closers: T[];
  managers: T[];
};

/**
 * Resolves who to tell. Nobody assigned goes to the setters, and a role with
 * nobody in it falls back to the managers, so an alert never goes nowhere.
 */
export function routeTargets<T extends RouteTarget>(notify: string[], ctx: RouteContext<T>): { targets: T[]; fellBack: boolean } {
  const out = new Map<string, T>();
  let fellBack = false;
  const add = (list: T[]) => list.forEach((target) => out.set(target.memberId, target));
  for (const who of notify) {
    const before = out.size;
    if (who === "assignee") add(ctx.assignee ? [ctx.assignee] : ctx.setters);
    else if (who === "setters") add(ctx.setters);
    else if (who === "closers") add(ctx.closers);
    else if (who === "managers") add(ctx.managers);
    else continue;
    if (out.size === before && who !== "managers") {
      add(ctx.managers);
      fellBack = true;
    }
  }
  if (out.size === 0) {
    add(ctx.managers);
    fellBack = true;
  }
  return { targets: [...out.values()], fellBack };
}

export type SendChannel = "push" | "email" | "sms" | "team";

/** Settings channels to delivery channels. Push is always included as the in-app fallback. */
export function routeChannels(channels: string[] | undefined): SendChannel[] {
  const out = new Set<SendChannel>();
  for (const channel of channels ?? []) {
    if (channel === "push" || channel === "email" || channel === "sms") out.add(channel);
    if (channel === "team_channel" || channel === "discord") out.add("team");
  }
  out.add("push");
  return [...out];
}

/** True when quiet hours hold this severity until the business opens. */
export function holdForQuietHours(args: { quietHours: unknown; urgentException: unknown; severity: string; open: boolean }): boolean {
  if (args.open || args.quietHours === "none") return false;
  if (args.urgentException === "urgent_and_critical" && (args.severity === "urgent" || args.severity === "critical")) return false;
  if (args.urgentException === "critical" && args.severity === "critical") return false;
  return true;
}

/** The level that applies to a missed window, counting levels from one. */
export function levelFor(level: number, levels: EscalationLevel[]): EscalationLevel | null {
  if (level <= 0) return null;
  const sorted = [...levels].filter((row) => Number.isFinite(row.after_windows)).sort((a, b) => a.after_windows - b.after_windows);
  return sorted[level - 1] ?? sorted[sorted.length - 1] ?? null;
}

/** A follow-up clock starts at the latest counted human touch. */
export function followUpStart(
  touches: Array<{ at: string; type: string; channel: string }>,
  counted: string[],
  fallback: string
): string {
  const allowed = new Set(counted);
  let latest = Date.parse(fallback);
  let at = fallback;
  for (const touch of touches) {
    if (touch.type !== "human" || !allowed.has(countedChannel(touch.channel))) continue;
    const time = Date.parse(touch.at);
    if (time > latest) {
      latest = time;
      at = touch.at;
    }
  }
  return at;
}
