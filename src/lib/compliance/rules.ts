import { computeSendAt, isInQuietHours } from "@/lib/follow-up/quiet-hours";
import { zonedStartOfDay } from "@/lib/home/periods";

/** Words that undo an opt-out: the carrier convention for texting back in. */
export const OPT_IN_WORDS = ["START", "UNSTOP"] as const;

/** A reply reduced to the word it is: trimmed, without surrounding punctuation, in capitals. */
function normalizeReply(text: string): string {
  return text
    .trim()
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "")
    .toUpperCase();
}

/** True when the whole reply is one of the opt-out words ("stop", "STOP.", " Stop! "), not a sentence containing one. */
export function isOptOutReply(text: string | null | undefined, words: readonly string[]): boolean {
  if (!text) return false;
  const reply = normalizeReply(text);
  if (!reply) return false;
  return words.some((word) => normalizeReply(word) === reply);
}

export function isOptInReply(text: string | null | undefined): boolean {
  if (!text) return false;
  return (OPT_IN_WORDS as readonly string[]).includes(normalizeReply(text));
}

export type QuietWindow = { start: string; end: string };

export type QuietHoursCheck =
  | { quiet: false }
  | { quiet: true; resumeAt: Date; zone: string };

/**
 * Quiet hours across every zone the lead may be in: quiet if it is quiet in
 * any of them, and the message waits until it is outside quiet hours in all
 * of them. If the zones are too far apart to share any sending time, the
 * first zone (the stored or most likely one) decides.
 */
export function checkQuietHours(now: Date, window: QuietWindow, zones: readonly string[]): QuietHoursCheck {
  const quietZone = zones.find((zone) => isInQuietHours(now, zone, window.start, window.end));
  if (!quietZone) return { quiet: false };

  let at = now;
  for (let round = 0; round < zones.length * 3; round += 1) {
    let moved = false;
    for (const zone of zones) {
      const next = computeSendAt({ now: at, timeZone: zone, enabled: true, startHm: window.start, endHm: window.end });
      if (next.getTime() > at.getTime()) {
        at = next;
        moved = true;
      }
    }
    if (!moved) return { quiet: true, resumeAt: at, zone: quietZone };
    if (at.getTime() - now.getTime() > 72 * 3_600_000) break;
  }

  const first = zones[0];
  if (!isInQuietHours(now, first, window.start, window.end)) return { quiet: false };
  return {
    quiet: true,
    resumeAt: computeSendAt({ now, timeZone: first, enabled: true, startHm: window.start, endHm: window.end }),
    zone: first,
  };
}

export type CapRules = {
  dailyCap: number;
  /** 0 means no weekly limit. */
  weeklyCap: number;
  appliesTo: "every_send" | "auto_run_only";
};

export type CapCheck = { allowed: true } | { allowed: false; limit: "daily" | "weekly" };

/** Whether one more message may go to this lead, given what it has already been sent. */
export function checkSendCaps(rules: CapRules, sent: { today: number; lastSevenDays: number }, autoRun: boolean): CapCheck {
  if (rules.appliesTo === "auto_run_only" && !autoRun) return { allowed: true };
  if (sent.today >= rules.dailyCap) return { allowed: false, limit: "daily" };
  if (rules.weeklyCap > 0 && sent.lastSevenDays >= rules.weeklyCap) return { allowed: false, limit: "weekly" };
  return { allowed: true };
}

export type ComplianceRules = {
  optOutWords: readonly string[];
  quietHours: QuietWindow;
  basis: "lead_local" | "workspace";
  caps: CapRules;
};

export type ComplianceDecision =
  | { action: "send"; zones: string[] }
  | { action: "block"; reason: "opted_out" }
  | { action: "defer"; until: Date; reason: "quiet_hours" | "daily_cap" | "weekly_cap" };

/** The start of the next calendar day in a time zone. */
function nextLocalMidnight(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return zonedStartOfDay(timeZone, read("year"), read("month"), read("day") + 1);
}

/**
 * Whether one queued message may go to a lead now. Order matters: an opted-out
 * lead is never messaged; quiet hours and the limits only delay a message.
 */
export function decideCompliance(input: {
  now: Date;
  rules: ComplianceRules;
  lead: { optedOutAt: string | null; zones: string[] };
  workspaceTimeZone: string;
  sent: { today: number; lastSevenDays: number; oldestInWeek: Date | null };
  autoRun: boolean;
}): ComplianceDecision {
  if (input.lead.optedOutAt) return { action: "block", reason: "opted_out" };

  const zones = input.rules.basis === "lead_local" ? input.lead.zones : [input.workspaceTimeZone];
  const quiet = checkQuietHours(input.now, input.rules.quietHours, zones);
  if (quiet.quiet) return { action: "defer", until: quiet.resumeAt, reason: "quiet_hours" };

  const cap = checkSendCaps(input.rules.caps, input.sent, input.autoRun);
  if (!cap.allowed && cap.limit === "daily") {
    return { action: "defer", until: nextLocalMidnight(input.now, input.workspaceTimeZone), reason: "daily_cap" };
  }
  if (!cap.allowed && cap.limit === "weekly") {
    const oldest = input.sent.oldestInWeek ?? input.now;
    return { action: "defer", until: new Date(oldest.getTime() + 7 * 86_400_000 + 60_000), reason: "weekly_cap" };
  }
  return { action: "send", zones };
}

/** The compliance section of an effective configuration, as rules. */
export function complianceRulesFrom(values: Record<string, unknown>): ComplianceRules {
  const window = values["compliance.quiet_hours"] as QuietWindow;
  return {
    optOutWords: (values["compliance.opt_out_words"] as string[] | undefined) ?? [],
    quietHours: window,
    basis: values["compliance.quiet_hours_basis"] === "lead_local" ? "lead_local" : "workspace",
    caps: {
      dailyCap: Number(values["compliance.daily_cap_per_lead"]),
      weeklyCap: Number(values["compliance.weekly_cap_per_lead"] ?? 0),
      appliesTo: values["compliance.cap_applies_to"] === "auto_run_only" ? "auto_run_only" : "every_send",
    },
  };
}
