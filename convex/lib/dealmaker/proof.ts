/**
 * How Dealmaker proves it works (docs/rebuild/dealmaker.md, 0.3 and step 18), all from the business's own
 * CRM and compared only with itself: close rate, show rate and speed to lead before and after Dealmaker was
 * switched on; the deals it was involved in (never "caused"); the time it saved, counted with a stated time
 * per item; and a weekly scorecard of what moved, what it did and what is next. Worked out in code; a figure
 * with too little behind it says "Not enough data". Pure.
 */

import type { AppointmentStatus, CrmActivity, CrmContact, CrmDeal } from "../crm/types";

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const NOT_ENOUGH_DATA = "Not enough data";

/** The fewest cases behind a rate or a typical time. */
export const PROOF_MIN = 5;
/** Before and after waits until Dealmaker has been on this long. */
export const MIN_AFTER_DAYS = 14;
/** The longest stretch compared on either side. */
export const MAX_WINDOW_DAYS = 90;

/** The stated time each piece of Dealmaker's work saves a person, in minutes. Shown beside the total. */
export const MINUTES_EACH = { brief: 20, message: 5, crmUpdate: 2 } as const;
export const WORK_LABEL: Record<keyof typeof MINUTES_EACH, string> = {
  brief: "Pre-call briefs written",
  message: "Messages drafted and sent",
  crmUpdate: "CRM updates made",
};

type Window = { from: number; to: number };
const inside = (at: number | null | undefined, w: Window) => typeof at === "number" && at >= w.from && at < w.to;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString("en-US")} ${currency}`;
  }
}

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** Won over won plus lost, for deals closed in the window. */
export function closeRate(deals: CrmDeal[], w: Window) {
  const closed = deals.filter((deal) => (deal.status === "won" || deal.status === "lost") && inside(deal.statusChangedAt ?? deal.updatedAt, w));
  const won = closed.filter((deal) => deal.status === "won").length;
  return closed.length >= PROOF_MIN ? { value: percent(won, closed.length), basis: `${won} won of ${closed.length} closed` } : { value: NOT_ENOUGH_DATA, basis: `${closed.length} closed` };
}

/** Showed over showed plus no-show, for calls in the window. A call never marked either way is left out. */
export function showRate(calls: { startsAt: number; status: AppointmentStatus }[], w: Window) {
  const decided = calls.filter((call) => inside(call.startsAt, w) && (call.status === "showed" || call.status === "noShow"));
  const showed = decided.filter((call) => call.status === "showed").length;
  return decided.length >= PROOF_MIN ? { value: percent(showed, decided.length), basis: `${showed} showed of ${decided.length} with an outcome` } : { value: NOT_ENOUGH_DATA, basis: `${decided.length} with an outcome` };
}

const OUTREACH = new Set(["call", "sms", "email"]);

/** The typical hours from a lead being added to the first call, text or email to them, for leads added in the window. */
export function speedToLead(contacts: CrmContact[], activities: CrmActivity[], w: Window) {
  const first = new Map<string, number>();
  for (const row of activities) {
    if (row.direction !== "outbound" || !OUTREACH.has(row.kind) || !row.contactRef) continue;
    const held = first.get(row.contactRef);
    if (held === undefined || row.at < held) first.set(row.contactRef, row.at);
  }
  const hours = contacts.flatMap((contact) => {
    if (!inside(contact.addedAt, w)) return [];
    const at = first.get(contact.ref);
    return at !== undefined && at >= contact.addedAt! ? [(at - contact.addedAt!) / HOUR] : [];
  });
  const middle = median(hours);
  if (middle === null || hours.length < PROOF_MIN) return { value: NOT_ENOUGH_DATA, basis: `${hours.length} new leads with a first reply` };
  const value = middle < 1 ? `${Math.max(1, Math.round(middle * 60))} minutes` : middle < 48 ? `${Math.round(middle * 10) / 10} hours` : `${Math.round(middle / 24)} days`;
  return { value, basis: `the middle of ${hours.length} new leads` };
}

export type ProofInput = {
  now: number;
  /** When Dealmaker was first switched on here, or null when that is not recorded. */
  onAt: number | null;
  deals: CrmDeal[];
  calls: { startsAt: number; status: AppointmentStatus }[];
  contacts: CrmContact[];
  activities: CrmActivity[];
};

/** Close rate, show rate and speed to lead over the same length of time before and after Dealmaker was switched on. */
export function beforeAndAfter(input: ProofInput) {
  if (input.onAt === null) return { ready: false as const, why: "Before and after starts from the day Dealmaker is switched on." };
  const afterDays = Math.floor((input.now - input.onAt) / DAY);
  if (afterDays < MIN_AFTER_DAYS) return { ready: false as const, why: `Before and after shows once Dealmaker has been on for ${MIN_AFTER_DAYS} days (${afterDays} so far).` };
  const days = Math.min(afterDays, MAX_WINDOW_DAYS);
  const after = { from: input.now - days * DAY, to: input.now };
  const before = { from: input.onAt - days * DAY, to: input.onAt };
  const row = (label: string, figure: (w: Window) => { value: string; basis: string }) => {
    const b = figure(before);
    const a = figure(after);
    return { label, before: b.value, after: a.value, basis: `Before: ${b.basis}. After: ${a.basis}.` };
  };
  return {
    ready: true as const,
    days,
    rows: [row("Close rate", (w) => closeRate(input.deals, w)), row("Show rate", (w) => showRate(input.calls, w)), row("Typical time to first reply", (w) => speedToLead(input.contacts, input.activities, w))],
    note: `The ${days} days before Dealmaker was switched on against the last ${days} days, from your own CRM. Other things changed too, so this shows what happened, not what caused it.`,
  };
}

/** Deals where Dealmaker's brief, follow-up or proposal was used: involved, never "caused". */
export function dealsInvolved(deals: CrmDeal[], involved: { dealRefs: Set<string>; contactRefs: Set<string> }, currency: string) {
  const rows = deals.filter((deal) => involved.dealRefs.has(deal.ref) || (deal.contactRef !== null && involved.contactRefs.has(deal.contactRef)));
  const won = rows.filter((deal) => deal.status === "won");
  const open = rows.filter((deal) => deal.status === "open");
  const sum = (list: CrmDeal[]) => list.reduce((total, deal) => total + (deal.value ?? 0), 0);
  return {
    deals: rows.length,
    won: won.length,
    wonValue: money(sum(won), currency),
    open: open.length,
    openValue: money(sum(open), currency),
    words: rows.length ? `Dealmaker was involved in ${rows.length} deal${rows.length === 1 ? "" : "s"}: ${won.length} won (${money(sum(won), currency)}) and ${open.length} still open (${money(sum(open), currency)}).` : "Dealmaker has not been involved in a deal yet.",
  };
}

/** The time saved, counted: each kind of work with how many and the stated minutes each. */
export function timeSaved(counts: Record<keyof typeof MINUTES_EACH, number>) {
  const items = (Object.keys(MINUTES_EACH) as (keyof typeof MINUTES_EACH)[]).map((key) => ({ key, label: WORK_LABEL[key], count: counts[key], minutesEach: MINUTES_EACH[key] }));
  const minutes = items.reduce((total, item) => total + item.count * item.minutesEach, 0);
  return { items, minutes, words: minutes < 60 ? `About ${minutes} minutes` : `About ${Math.round((minutes / 60) * 10) / 10} hours` };
}

export type ScorecardInput = {
  from: number;
  to: number;
  currency: string;
  deals: CrmDeal[];
  stageMoves: number;
  work: Record<keyof typeof MINUTES_EACH, number>;
  movesWaiting: number;
  briefsDue: number;
  draftsWaiting: number;
};

/** The weekly scorecard: what moved, what Dealmaker did, what is next. Three rows of words, written in code. */
export function scorecard(input: ScorecardInput) {
  const w = { from: input.from, to: input.to };
  const won = input.deals.filter((deal) => deal.status === "won" && inside(deal.statusChangedAt, w));
  const lost = input.deals.filter((deal) => deal.status === "lost" && inside(deal.statusChangedAt, w));
  const value = money(won.reduce((total, deal) => total + (deal.value ?? 0), 0), input.currency);
  const saved = timeSaved(input.work);
  const moved = `${input.stageMoves} stage move${input.stageMoves === 1 ? "" : "s"}, ${won.length} won (${value}), ${lost.length} lost.`;
  const did = `${input.work.brief} brief${input.work.brief === 1 ? "" : "s"}, ${input.work.message} message${input.work.message === 1 ? "" : "s"} sent, ${input.work.crmUpdate} CRM update${input.work.crmUpdate === 1 ? "" : "s"}. ${saved.words} saved.`;
  const next = `${input.movesWaiting} deal${input.movesWaiting === 1 ? "" : "s"} need a move, ${input.draftsWaiting} draft${input.draftsWaiting === 1 ? "" : "s"} wait in Comms, ${input.briefsDue} brief${input.briefsDue === 1 ? "" : "s"} due.`;
  return { moved, did, next, won: won.length, lost: lost.length };
}

/** The Monday (00:00 UTC) that starts the week holding `at`. */
export function weekStart(at: number) {
  const day = Math.floor(at / DAY) * DAY;
  const weekday = (new Date(day).getUTCDay() + 6) % 7;
  return day - weekday * DAY;
}
