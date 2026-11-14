/**
 * The end-of-day report (build step 12d; docs/rebuild/dealmaker.md, 0.8 "Conversation Intelligence"): today's
 * booked calls by outcome, what was done after them, what is still open, and tomorrow's calls. Counted in code
 * from the CRM and Vistrial's own rows; no model, no score, no verdict on a person. Pure.
 */

import type { AppointmentStatus } from "../crm/types";

export type DayCall = {
  startsAt: number;
  status: AppointmentStatus;
  /** The CRM user who owns the lead's deal, for the per-rep rows. */
  repRef: string | null;
  noted: boolean;
  reviewed: boolean;
  briefed: boolean;
};

export type RepRow = { name: string; held: number; noShow: number; notMarked: number; noted: number };

export type EndOfDay = {
  figures: { calls: number; held: number; noShow: number; cancelled: number; notMarked: number; later: number };
  done: { briefs: number; notes: number; reviews: number; sent: number };
  /** What is still open, each a sentence a person acts on. Empty when nothing is. */
  open: string[];
  tomorrow: { calls: number; withoutBrief: number };
  /** One sentence for the Briefing post: counts only, no person's name. */
  headline: string;
};

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function endOfDay(input: { now: number; today: DayCall[]; tomorrow: DayCall[]; briefsMade: number; messagesSent: number; draftsWaiting: number; commitmentsDue: number }): EndOfDay {
  const live = input.today.filter((row) => row.status !== "cancelled");
  const past = live.filter((row) => row.startsAt <= input.now);
  const held = past.filter((row) => row.status === "showed");
  const noShow = past.filter((row) => row.status === "noShow");
  const notMarked = past.filter((row) => row.status !== "showed" && row.status !== "noShow");
  const figures = {
    calls: live.length,
    held: held.length,
    noShow: noShow.length,
    cancelled: input.today.length - live.length,
    notMarked: notMarked.length,
    later: live.length - past.length,
  };

  const unnoted = held.filter((row) => !row.noted).length;
  const unreviewed = held.filter((row) => row.noted && !row.reviewed).length;
  const tomorrowLive = input.tomorrow.filter((row) => row.status !== "cancelled");
  const withoutBrief = tomorrowLive.filter((row) => !row.briefed).length;
  const open: string[] = [];
  if (notMarked.length) open.push(`Mark ${plural(notMarked.length, "call")} as held or no-show in your CRM.`);
  if (unnoted) open.push(`Add notes for ${plural(unnoted, "held call")}.`);
  if (unreviewed) open.push(`${plural(unreviewed, "held call")} with notes ${unreviewed === 1 ? "has" : "have"} no review yet.`);
  if (input.draftsWaiting) open.push(`${plural(input.draftsWaiting, "message")} ${input.draftsWaiting === 1 ? "waits" : "wait"} in Comms.`);
  if (input.commitmentsDue) open.push(`${plural(input.commitmentsDue, "promise")} to a lead ${input.commitmentsDue === 1 ? "is" : "are"} due or overdue.`);
  if (withoutBrief) open.push(`${plural(withoutBrief, "call")} tomorrow ${withoutBrief === 1 ? "has" : "have"} no brief yet.`);

  const headline = figures.calls
    ? `${plural(figures.calls, "booked call")} today: ${figures.held} held, ${figures.noShow} no-show${figures.notMarked ? `, ${figures.notMarked} not marked` : ""}${figures.later ? `, ${figures.later} later` : ""}. ${plural(tomorrowLive.length, "call")} tomorrow.`
    : `No booked calls today. ${plural(tomorrowLive.length, "call")} tomorrow.`;

  return {
    figures,
    done: { briefs: input.briefsMade, notes: input.today.filter((row) => row.noted).length, reviews: input.today.filter((row) => row.reviewed).length, sent: input.messagesSent },
    open,
    tomorrow: { calls: tomorrowLive.length, withoutBrief },
    headline,
  };
}

/** Per rep, for an Owner or Admin: counts only, named by the CRM user linked in the team settings. */
export function byRep(calls: DayCall[], now: number, nameOf: (repRef: string) => string | null): RepRow[] {
  const rows = new Map<string, RepRow>();
  for (const call of calls) {
    if (call.status === "cancelled" || call.startsAt > now) continue;
    const name = (call.repRef && nameOf(call.repRef)) || "Not assigned";
    const row = rows.get(name) ?? { name, held: 0, noShow: 0, notMarked: 0, noted: 0 };
    if (call.status === "showed") row.held += 1;
    else if (call.status === "noShow") row.noShow += 1;
    else row.notMarked += 1;
    if (call.noted) row.noted += 1;
    rows.set(name, row);
  }
  return [...rows.values()].sort((a, b) => (a.name === "Not assigned" ? 1 : b.name === "Not assigned" ? -1 : a.name.localeCompare(b.name)));
}

/** The local hour of an instant in a time zone (UTC for an unknown zone). */
export function localHour(at: number, timezone: string | null) {
  try {
    const hour = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone ?? "UTC" }).format(at);
    return Number(hour) % 24;
  } catch {
    return new Date(at).getUTCHours();
  }
}

/** The report is posted once a day, from this local hour. */
export const POST_HOUR = 18;
