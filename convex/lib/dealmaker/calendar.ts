/**
 * Dealmaker's Calendar (docs/rebuild/dealmaker.md, 0.5 and step 17): booked calls from the CRM's
 * appointments in a week grid, worked out in code. Days are the business's own (the CRM's time zone), the
 * show rate is counted from calls already past with a status, and a brief is "due" for a call within a day
 * that has none. Pure: the server, the screens and the tests read the same rules.
 */

import type { AppointmentStatus } from "../crm/types";

export const DAY = 86_400_000;

/** The fewest past calls with an outcome before a show rate is given. */
export const SHOW_RATE_MIN = 5;
/** How far back the show-rate figures look. */
export const SHOW_RATE_DAYS = 30;
/** A call this close with no brief has a brief due. */
export const BRIEF_DUE_HOURS = 24;
/** How many weeks back or ahead a person may page. */
export const WEEKS_RANGE = 8;

export const NOT_ENOUGH_DATA = "Not enough data";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  showed: "Showed",
  noShow: "No-show",
  cancelled: "Cancelled",
  unknown: "Status unknown",
};

export type BriefState = "none" | "running" | "ready" | "needsReview" | "failed";
export type BriefBadge = "ready" | "being written" | "due" | "none" | "check";

export const BRIEF_LABEL: Record<BriefBadge, string> = {
  ready: "Brief ready",
  "being written": "Brief being written",
  due: "Brief due",
  none: "No brief",
  check: "Brief needs a look",
};

/** What a call's brief looks like on the calendar. A call within a day and not yet started with no brief is due. */
export function briefBadge(state: BriefState, startsAt: number, now: number, status: AppointmentStatus): BriefBadge {
  if (state === "ready") return "ready";
  if (state === "running") return "being written";
  if (state === "needsReview" || state === "failed") return "check";
  const soon = startsAt > now && startsAt - now <= BRIEF_DUE_HOURS * 3_600_000;
  return soon && status !== "cancelled" ? "due" : "none";
}

/** The calendar date of an instant in a time zone, as YYYY-MM-DD. Falls back to UTC for an unknown zone. */
export function dayKey(at: number, timezone: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
    const get = (type: string) => parts.find((row) => row.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

function keyToUtc(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(at: number) {
  return new Date(at).toISOString().slice(0, 10);
}

/** The seven days (Monday first) of the week `offset` weeks from the one holding `now`, in the business's zone. */
export function weekDays(now: number, timezone: string | null, offset = 0): string[] {
  const today = keyToUtc(dayKey(now, timezone));
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const monday = today - weekday * DAY + offset * 7 * DAY;
  return Array.from({ length: 7 }, (_, index) => utcToKey(monday + index * DAY));
}

/** A window wide enough to hold every call on these days in any time zone. */
export function windowOf(days: string[]) {
  return { from: keyToUtc(days[0]) - DAY, to: keyToUtc(days[days.length - 1]) + 2 * DAY };
}

export function dayLabel(key: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(keyToUtc(key));
}

export function timeLabel(at: number, timezone: string | null) {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone ?? "UTC" }).format(at);
  } catch {
    return new Date(at).toISOString().slice(11, 16);
  }
}

/**
 * Show-rate figures from past calls: showed, no-show and cancelled are counted; a past call never marked
 * either way is counted as not marked, not as a no-show. The rate is showed over showed plus no-show.
 */
export function showFigures(calls: { startsAt: number; status: AppointmentStatus }[], now: number) {
  const past = calls.filter((row) => row.startsAt <= now && row.startsAt > now - SHOW_RATE_DAYS * DAY);
  const count = (status: AppointmentStatus) => past.filter((row) => row.status === status).length;
  const showed = count("showed");
  const noShow = count("noShow");
  const cancelled = count("cancelled");
  const notMarked = past.length - showed - noShow - cancelled;
  const decided = showed + noShow;
  return {
    days: SHOW_RATE_DAYS,
    showed,
    noShow,
    cancelled,
    notMarked,
    showRate: decided >= SHOW_RATE_MIN ? `${Math.round((showed / decided) * 100)}%` : NOT_ENOUGH_DATA,
    basis:
      decided >= SHOW_RATE_MIN
        ? `${showed} showed of ${decided} calls with an outcome in the last ${SHOW_RATE_DAYS} days.`
        : `Fewer than ${SHOW_RATE_MIN} past calls are marked showed or no-show in your CRM.`,
  };
}
