/**
 * The Pipeline board, worked out in code on every read, at no model cost (docs/rebuild/dealmaker.md, 0.5 and
 * 0.8, build step 9). Pure: the query, the screens and the tests read the same rules. No score anywhere:
 * health, temperature and readiness are words with the signals behind them.
 *
 * - Health (active, cooling, quiet, won, lost): from the last activity or stage change against the business's
 *   quiet-days setting.
 * - Temperature (hot, warm, cold): from engagement signals only (the lead's replies and showing up), and says so.
 * - Who has the ball: the lead (we wrote last), us (they wrote last), or approval (a change waits for a person).
 * - Readiness: the five fit fields, each established with its evidence and kind, or unresolved. Never a number.
 * - Today's moves: one next move per deal that needs one, worded under doctrine IV.
 * - Forecast: a range from the business's own won and lost deals, or "Not enough data".
 */

import type { CrmActivity, CrmAppointment, CrmDeal, CrmPipeline } from "../crm/types";
import { EVIDENCE_KINDS } from "../../skills/dealmaker/doctrine";

export const DAY = 86_400_000;
export const NOT_ENOUGH_DATA = "Not enough data";
/** Below this many closed deals, no rate or forecast is made. */
export const MIN_CLOSED = 5;

export const HEALTHS = ["active", "cooling", "quiet", "won", "lost"] as const;
export type Health = (typeof HEALTHS)[number];
export const HEALTH_LABEL: Record<Health, string> = { active: "Active", cooling: "Cooling", quiet: "Quiet", won: "Won", lost: "Lost" };

export type Temperature = "hot" | "warm" | "cold";
export const TEMPERATURE_LABEL: Record<Temperature, string> = { hot: "Hot", warm: "Warm", cold: "Cold" };
export const TEMPERATURE_BASIS = "From the lead's replies and whether they showed up. Not a judgement of fit.";

export type Ball = "lead" | "us" | "approval" | "none";
export const BALL_LABEL: Record<Ball, string> = { lead: "Waiting on the lead", us: "Ours to answer", approval: "Waiting for approval", none: "No contact yet" };

export const FIT_FIELDS = ["need", "budget", "decider", "timing", "fit"] as const;
export type FitField = (typeof FIT_FIELDS)[number];
export const FIT_LABEL: Record<FitField, string> = { need: "Need", budget: "Budget", decider: "Who decides", timing: "Timing", fit: "Fit" };
export type EvidenceKind = keyof typeof EVIDENCE_KINDS;

export type Fact = { dealRef: string; field: FitField; value: string; kind: EvidenceKind; author: string | null; at: number };
export type Commitment = { id: string; dealRef: string; text: string; owner: string; due: number | null; done: boolean };

export type BoardInput = {
  now: number;
  quietDays: number;
  currency: string;
  pipeline: CrmPipeline | null;
  deals: CrmDeal[];
  activities: CrmActivity[];
  appointments: CrmAppointment[];
  /** Contacts with a CRM change waiting for a person. */
  waitingContacts: ReadonlySet<string>;
  /** Contacts paused after a negative reply. */
  pausedContacts: ReadonlySet<string>;
  facts: Fact[];
  commitments: Commitment[];
};

export type Card = {
  ref: string;
  stageRef: string;
  value: number;
  source: string | null;
  ownerRef: string | null;
  health: Health;
  healthWhy: string;
  temperature: Temperature;
  temperatureWhy: string;
  ball: Ball;
  paused: boolean;
  daysSinceTouch: number | null;
  established: { field: FitField; label: string; value: string; kind: string; author: string | null }[];
  unresolved: { field: FitField; label: string }[];
  commitments: Commitment[];
  move: { kind: "answer" | "deliver" | "confirm" | "checkIn" | "rebook" | "firstReply"; words: string } | null;
};

const days = (ms: number) => Math.floor(ms / DAY);

/** Health from the last touch against the quiet-days setting: active up to half of it, cooling to it, quiet after. */
export function healthOf(deal: Pick<CrmDeal, "status">, lastTouch: number | null, now: number, quietDays: number): { health: Health; why: string } {
  if (deal.status === "won") return { health: "won", why: "Marked won in your CRM." };
  if (deal.status === "lost" || deal.status === "abandoned") return { health: "lost", why: "Marked lost in your CRM." };
  if (lastTouch === null) return { health: "quiet", why: "No activity recorded in your CRM." };
  const quiet = days(now - lastTouch);
  if (quiet >= quietDays) return { health: "quiet", why: `No activity for ${quiet} days (quiet after ${quietDays}).` };
  if (quiet >= Math.ceil(quietDays / 2)) return { health: "cooling", why: `No activity for ${quiet} days.` };
  return { health: "active", why: quiet === 0 ? "Activity today." : `Activity ${quiet} ${quiet === 1 ? "day" : "days"} ago.` };
}

/** Temperature from engagement only: a reply or a show in the last week is hot, a reply in two weeks warm. */
export function temperatureOf(inbound: number | null, showed: number | null, now: number): { temperature: Temperature; why: string } {
  const recent = (at: number | null, within: number) => at !== null && now - at <= within * DAY;
  if (recent(inbound, 7)) return { temperature: "hot", why: `Replied ${days(now - inbound!)} days ago.` };
  if (recent(showed, 7)) return { temperature: "hot", why: "Showed up to a call this week." };
  if (recent(inbound, 14)) return { temperature: "warm", why: `Replied ${days(now - inbound!)} days ago.` };
  return { temperature: "cold", why: inbound === null ? "No reply recorded." : `Last replied ${days(now - inbound)} days ago.` };
}

const TOUCH_KINDS = new Set(["call", "sms", "email", "chat", "social", "meeting", "stage_change", "status_change"]);
const TALK_KINDS = new Set(["call", "sms", "email", "chat", "social"]);

/** The single next move for a deal that needs one, worded so it answers, delivers, confirms or asks (doctrine IV). */
function moveFor(card: Omit<Card, "move">, noShowAt: number | null, now: number, lastMessageDirection: "inbound" | "outbound" | null): Card["move"] {
  if (card.paused || card.health === "won" || card.health === "lost") return null;
  if (card.ball === "us") return { kind: "answer", words: "Answer the lead's last message." };
  const due = card.commitments.find((row) => !row.done && row.due !== null && row.due <= now + DAY);
  if (due) return { kind: "deliver", words: `Deliver what was promised: ${due.text}` };
  if (noShowAt !== null && now - noShowAt <= 7 * DAY) return { kind: "rebook", words: "Offer a new time after the missed call." };
  if (card.health === "quiet" && lastMessageDirection !== null) return { kind: "checkIn", words: "Ask honestly whether further contact is welcome." };
  if (lastMessageDirection === null && card.health !== "quiet") return { kind: "firstReply", words: "Send the first reply. It waits for a person." };
  return null;
}

export function buildBoard(input: BoardInput) {
  const byDeal = new Map<string, CrmActivity[]>();
  const byContact = new Map<string, CrmActivity[]>();
  for (const row of input.activities) {
    if (row.dealRef) byDeal.set(row.dealRef, [...(byDeal.get(row.dealRef) ?? []), row]);
    if (row.contactRef) byContact.set(row.contactRef, [...(byContact.get(row.contactRef) ?? []), row]);
  }
  const shows = new Map<string, number>();
  const noShows = new Map<string, number>();
  for (const row of input.appointments) {
    if (!row.contactRef || row.startsAt > input.now) continue;
    if (row.status === "showed") shows.set(row.contactRef, Math.max(shows.get(row.contactRef) ?? 0, row.startsAt));
    if (row.status === "noShow") noShows.set(row.contactRef, Math.max(noShows.get(row.contactRef) ?? 0, row.startsAt));
  }
  const factsBy = new Map<string, Fact[]>();
  for (const row of input.facts) factsBy.set(row.dealRef, [...(factsBy.get(row.dealRef) ?? []), row]);

  const cards: Card[] = input.deals
    .filter((deal) => !input.pipeline || deal.pipelineRef === input.pipeline.ref)
    .map((deal) => {
      const own = [...(byDeal.get(deal.ref) ?? []), ...(deal.contactRef ? (byContact.get(deal.contactRef) ?? []) : [])];
      const touches = own.filter((row) => TOUCH_KINDS.has(row.kind)).map((row) => row.at);
      const lastTouch = Math.max(...touches, deal.stageChangedAt ?? 0, 0) || null;
      const talk = own.filter((row) => TALK_KINDS.has(row.kind) && row.direction).sort((a, b) => b.at - a.at);
      const inbound = talk.find((row) => row.direction === "inbound")?.at ?? null;
      const lastDirection = talk[0]?.direction ?? null;
      const paused = !!deal.contactRef && input.pausedContacts.has(deal.contactRef);
      const waiting = !!deal.contactRef && input.waitingContacts.has(deal.contactRef);
      const ball: Ball = waiting ? "approval" : lastDirection === "inbound" ? "us" : lastDirection === "outbound" ? "lead" : "none";
      const health = healthOf(deal, lastTouch, input.now, input.quietDays);
      const temperature = temperatureOf(inbound, deal.contactRef ? (shows.get(deal.contactRef) ?? null) : null, input.now);
      const latest = new Map<FitField, Fact>();
      for (const fact of (factsBy.get(deal.ref) ?? []).sort((a, b) => a.at - b.at)) latest.set(fact.field, fact);
      const base = {
        ref: deal.ref,
        stageRef: deal.stageRef,
        value: deal.value,
        source: deal.source,
        ownerRef: deal.ownerRef,
        health: health.health,
        healthWhy: health.why,
        temperature: temperature.temperature,
        temperatureWhy: temperature.why,
        ball,
        paused,
        daysSinceTouch: lastTouch === null ? null : days(input.now - lastTouch),
        established: FIT_FIELDS.filter((field) => latest.has(field)).map((field) => {
          const fact = latest.get(field)!;
          return { field, label: FIT_LABEL[field], value: fact.value, kind: EVIDENCE_KINDS[fact.kind], author: fact.author };
        }),
        unresolved: FIT_FIELDS.filter((field) => !latest.has(field)).map((field) => ({ field, label: FIT_LABEL[field] })),
        commitments: input.commitments.filter((row) => row.dealRef === deal.ref && !row.done),
      };
      return { ...base, move: moveFor(base, deal.contactRef ? (noShows.get(deal.contactRef) ?? null) : null, input.now, lastDirection) };
    });

  const stages = (input.pipeline?.stages ?? []).slice().sort((a, b) => a.order - b.order);
  const open = cards.filter((row) => row.health !== "won" && row.health !== "lost");
  const moves = open
    .filter((row) => row.move)
    .sort((a, b) => (a.move!.kind === "answer" ? -1 : 0) - (b.move!.kind === "answer" ? -1 : 0) || (b.daysSinceTouch ?? 0) - (a.daysSinceTouch ?? 0))
    .map((row) => ({ ref: row.ref, ...row.move! }));

  return {
    stages: stages.map((stage) => ({ ref: stage.ref, name: stage.name, cards: cards.filter((row) => row.stageRef === stage.ref) })),
    counts: Object.fromEntries(HEALTHS.map((health) => [health, cards.filter((row) => row.health === health).length])) as Record<Health, number>,
    moves,
    sources: sourceQuality(input.deals),
    perRep: perRep(cards),
    forecast: forecastOf(input.deals, input.currency),
  };
}

/** Per source: deals, won and lost, and a win rate only from enough closed deals. */
export function sourceQuality(deals: CrmDeal[]) {
  const rows = new Map<string, { deals: number; won: number; lost: number }>();
  for (const deal of deals) {
    const key = deal.source ?? "No source recorded";
    const row = rows.get(key) ?? { deals: 0, won: 0, lost: 0 };
    row.deals += 1;
    if (deal.status === "won") row.won += 1;
    if (deal.status === "lost" || deal.status === "abandoned") row.lost += 1;
    rows.set(key, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[1].deals - a[1].deals)
    .map(([source, row]) => {
      const closed = row.won + row.lost;
      return { source, ...row, winRate: closed >= MIN_CLOSED ? `${Math.round((row.won / closed) * 100)}%` : NOT_ENOUGH_DATA };
    });
}

/** Per rep, with the context fair judgment needs (doctrine V): their deals by health, never a verdict. */
export function perRep(cards: Card[]) {
  const rows = new Map<string, Record<Health, number> & { deals: number }>();
  for (const card of cards) {
    const key = card.ownerRef ?? "unassigned";
    const row = rows.get(key) ?? { deals: 0, active: 0, cooling: 0, quiet: 0, won: 0, lost: 0 };
    row.deals += 1;
    row[card.health] += 1;
    rows.set(key, row);
  }
  return [...rows.entries()].map(([ownerRef, row]) => ({ ownerRef, ...row }));
}

/**
 * Revenue from open deals as a range: open value times the business's own win rate, from at least MIN_CLOSED
 * closed deals, with the rate's uncertainty shown by using the rate with one more loss and one more win.
 */
export function forecastOf(deals: CrmDeal[], currency: string): { range: string; basis: string } {
  const won = deals.filter((row) => row.status === "won").length;
  const lost = deals.filter((row) => row.status === "lost" || row.status === "abandoned").length;
  const openValue = deals.filter((row) => row.status === "open").reduce((sum, row) => sum + (row.value || 0), 0);
  const closed = won + lost;
  if (closed < MIN_CLOSED || openValue <= 0) return { range: NOT_ENOUGH_DATA, basis: `Needs at least ${MIN_CLOSED} won or lost deals and open deals with a value; there are ${closed} closed.` };
  const low = openValue * (won / (closed + 1));
  const high = openValue * ((won + 1) / (closed + 1));
  const fmt = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(value));
  return { range: `${fmt(low)} to ${fmt(high)}`, basis: `Open deal value ${fmt(openValue)} at your own win rate of ${won} won of ${closed} closed. A range, not a promise.` };
}
