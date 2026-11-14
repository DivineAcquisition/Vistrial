/**
 * Every figure Pipeline Forensics uses, worked out in code from the CRM's own rows. Pure: the same rows always
 * give the same figures, and a test can read every case. No model sees a number this file did not make.
 */

import type { CrmActivity, CrmAppointment, CrmDeal, CrmPipeline } from "../../lib/crm/types";
import { MIN_DEALS, MIN_SAMPLE, NOT_ENOUGH_DATA, type Figure, type ForensicsRecord, type StageFlow } from "./shapes";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type ForensicsInput = {
  crm: { label: string; accountName: string; currency: string };
  /** "diffed" when the CRM keeps no stage history and moves are found by comparing reads. */
  stageHistory: "exact" | "diffed";
  pipelines: CrmPipeline[];
  deals: CrmDeal[];
  activities: CrmActivity[];
  appointments: CrmAppointment[];
  /** Leads added in the window, with when, for speed to first touch. */
  contacts: { ref: string; addedAt: number | null }[];
  now: number;
  windowDays: number;
  stalledDays: number;
  /** The CRM source saved on the project; every figure cites it. */
  sourceId: string;
};

export function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString("en-US")} ${currency}`;
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** When a deal was last touched: its own activity, its lead's activity, or its last stage or status change. */
function lastTouch(deal: CrmDeal, byDeal: Map<string, number>, byContact: Map<string, number>) {
  return Math.max(
    byDeal.get(deal.ref) ?? 0,
    deal.contactRef ? (byContact.get(deal.contactRef) ?? 0) : 0,
    deal.stageChangedAt ?? 0,
    deal.statusChangedAt ?? 0,
    deal.createdAt ?? 0,
  );
}

/** Not enough data: what was found, and what to do about it. No figures. */
function notEnough(input: Pick<ForensicsInput, "crm" | "windowDays" | "stalledDays"> | null, projectId: string, missing: string[], pipeline: ForensicsRecord["pipeline"] = null, otherPipelines = 0): ForensicsRecord {
  return {
    projectId,
    hasData: false,
    crm: input?.crm ?? null,
    pipeline,
    otherPipelines,
    windowDays: input?.windowDays ?? 0,
    stalledDays: input?.stalledDays ?? 0,
    stages: [],
    stall: null,
    figures: [],
    missing,
  };
}

/** No CRM is connected for this organization or client. */
export function noCrm(projectId: string): ForensicsRecord {
  return notEnough(null, projectId, [`${NOT_ENOUGH_DATA}: no CRM is connected here. Connect HighLevel on the Connections page (HubSpot and Salesforce are coming), then run the review again.`]);
}

export function computeForensics(input: ForensicsInput, projectId: string): ForensicsRecord {
  const { now, windowDays, stalledDays, crm } = input;
  const since = now - windowDays * DAY;
  const period = `last ${windowDays} days`;

  // The pipeline under review: the one with the most deals the window touches.
  const relevant = input.deals.filter((deal) => deal.status === "open" || (deal.updatedAt ?? deal.statusChangedAt ?? deal.createdAt ?? 0) >= since);
  const counts = new Map<string, number>();
  for (const deal of relevant) counts.set(deal.pipelineRef, (counts.get(deal.pipelineRef) ?? 0) + 1);
  const pipeline = [...input.pipelines].sort((a, b) => (counts.get(b.ref) ?? 0) - (counts.get(a.ref) ?? 0))[0];
  if (!pipeline) return notEnough(input, projectId, [`${NOT_ENOUGH_DATA}: the CRM has no pipeline Vistrial could read. Read it again from the Connections page.`]);
  const otherPipelines = input.pipelines.filter((row) => row.ref !== pipeline.ref && (counts.get(row.ref) ?? 0) > 0).length;
  const deals = relevant.filter((deal) => deal.pipelineRef === pipeline.ref);
  const pipelineRef = { ref: pipeline.ref, name: pipeline.name };
  if (deals.length < MIN_DEALS) {
    return notEnough(input, projectId, [`${NOT_ENOUGH_DATA}: the ${pipeline.name} pipeline has ${plural(deals.length, "deal")} that are open or moved in the ${period}; a review needs at least ${MIN_DEALS}.`], pipelineRef, otherPipelines);
  }

  const figures: Figure[] = [];
  const missing: string[] = [];
  const add = (row: Omit<Figure, "id" | "sourceRefIds">) => {
    const figure = { ...row, id: `P${figures.length + 1}`, sourceRefIds: [input.sourceId] };
    figures.push(figure);
    return figure;
  };

  const byDeal = new Map<string, number>();
  const byContact = new Map<string, number>();
  for (const row of input.activities) {
    if (row.dealRef) byDeal.set(row.dealRef, Math.max(byDeal.get(row.dealRef) ?? 0, row.at));
    if (row.contactRef) byContact.set(row.contactRef, Math.max(byContact.get(row.contactRef) ?? 0, row.at));
  }
  const open = deals.filter((deal) => deal.status === "open");
  const isStalled = (deal: CrmDeal) => now - lastTouch(deal, byDeal, byContact) >= stalledDays * DAY;
  const daysIn = (deal: CrmDeal) => {
    const since = deal.stageChangedAt ?? deal.createdAt;
    return since ? Math.floor((now - since) / DAY) : null;
  };

  // ---- Each stage ----
  const stages: StageFlow[] = pipeline.stages.map((stage) => {
    const here = open.filter((deal) => deal.stageRef === stage.ref);
    const stalled = here.filter(isStalled);
    const days = here.map(daysIn).filter((value): value is number => value !== null);
    const movedOn = input.activities.filter((row) => row.kind === "stage_change" && row.fromStageRef === stage.ref && row.at >= since && deals.some((deal) => deal.ref === row.dealRef)).length;
    return {
      ref: stage.ref,
      name: stage.name,
      order: stage.order,
      open: here.length,
      openValue: here.reduce((sum, deal) => sum + deal.value, 0),
      stalled: stalled.length,
      stalledValue: stalled.reduce((sum, deal) => sum + deal.value, 0),
      medianDays: days.length >= MIN_SAMPLE ? Math.round(median(days)!) : null,
      movedOn,
    };
  });

  // ---- The pipeline as a whole ----
  const openValue = open.reduce((sum, deal) => sum + deal.value, 0);
  const stalledAll = open.filter(isStalled);
  const stalledValue = stalledAll.reduce((sum, deal) => sum + deal.value, 0);
  add({ label: "Open deals", value: open.length, display: String(open.length), computed: false });
  add({ label: "Value of open deals", value: openValue, display: money(openValue, crm.currency), computed: true, formula: `the sum of ${plural(open.length, "open deal")}` });
  add({ label: `Deals quiet for ${stalledDays} days or more`, value: stalledAll.length, display: String(stalledAll.length), computed: true, formula: `open deals with no activity and no stage change for ${stalledDays} days` });
  add({ label: `Value of deals quiet for ${stalledDays} days or more`, value: stalledValue, display: money(stalledValue, crm.currency), computed: true, formula: `the sum of ${plural(stalledAll.length, "quiet deal")}` });

  for (const stage of stages) {
    if (stage.open === 0 && stage.movedOn === 0) continue;
    add({ label: `Open deals in ${stage.name}`, value: stage.open, display: String(stage.open), computed: false, stageRef: stage.ref });
    if (stage.stalled > 0) add({ label: `Quiet deals in ${stage.name}`, value: stage.stalled, display: String(stage.stalled), computed: true, formula: `open deals in ${stage.name} with no activity for ${stalledDays} days`, stageRef: stage.ref });
    if (stage.medianDays !== null) add({ label: `Typical time in ${stage.name}`, value: stage.medianDays, display: `${stage.medianDays} days`, computed: true, formula: `the middle of ${plural(stage.open, "open deal")}' days in the stage`, stageRef: stage.ref });
    if (stage.movedOn > 0) add({ label: `Deals that moved on from ${stage.name}`, value: stage.movedOn, display: String(stage.movedOn), computed: false, stageRef: stage.ref, period });
  }

  // ---- Won and lost in the window ----
  const closedIn = (deal: CrmDeal) => (deal.statusChangedAt ?? deal.updatedAt ?? 0) >= since;
  const won = deals.filter((deal) => deal.status === "won" && closedIn(deal));
  const lost = deals.filter((deal) => (deal.status === "lost" || deal.status === "abandoned") && closedIn(deal));
  const wonValue = won.reduce((sum, deal) => sum + deal.value, 0);
  add({ label: "Deals won", value: won.length, display: String(won.length), computed: false, period });
  add({ label: "Value of deals won", value: wonValue, display: money(wonValue, crm.currency), computed: true, formula: `the sum of ${plural(won.length, "won deal")}`, period });
  add({ label: "Deals lost or abandoned", value: lost.length, display: String(lost.length), computed: false, period });
  const closed = won.length + lost.length;
  if (closed >= MIN_SAMPLE) {
    const rate = Math.round((won.length / closed) * 100);
    add({ label: "Close rate", value: rate, display: `${rate}%`, computed: true, formula: `${won.length} won of ${closed} closed`, period });
  } else missing.push(`${NOT_ENOUGH_DATA} for a close rate: ${plural(closed, "deal")} closed in the ${period}; it needs ${MIN_SAMPLE}.`);

  // ---- Booked calls ----
  const past = input.appointments.filter((row) => row.startsAt >= since && row.startsAt <= now);
  if (input.appointments.length === 0) {
    missing.push(`${NOT_ENOUGH_DATA} on booked calls: ${crm.label} returned no appointments for the ${period}.`);
  } else {
    const showed = past.filter((row) => row.status === "showed").length;
    const noShow = past.filter((row) => row.status === "noShow").length;
    const cancelled = past.filter((row) => row.status === "cancelled").length;
    add({ label: "Booked calls", value: past.length, display: String(past.length), computed: false, period });
    add({ label: "No-shows", value: noShow, display: String(noShow), computed: false, period });
    add({ label: "Cancelled calls", value: cancelled, display: String(cancelled), computed: false, period });
    if (showed + noShow >= MIN_SAMPLE) {
      const rate = Math.round((showed / (showed + noShow)) * 100);
      add({ label: "Show rate", value: rate, display: `${rate}%`, computed: true, formula: `${showed} showed of ${showed + noShow} calls marked showed or no-show`, period });
    } else missing.push(`${NOT_ENOUGH_DATA} for a show rate: ${plural(showed + noShow, "call")} marked showed or no-show; it needs ${MIN_SAMPLE}.`);
  }

  // ---- Speed to first touch ----
  const touches = input.activities.filter((row) => row.direction === "outbound" && (row.kind === "call" || row.kind === "sms" || row.kind === "email" || row.kind === "chat"));
  const hours: number[] = [];
  for (const contact of input.contacts) {
    if (!contact.addedAt || contact.addedAt < since) continue;
    const first = touches.filter((row) => row.contactRef === contact.ref && row.at >= contact.addedAt!).reduce((min, row) => Math.min(min, row.at), Infinity);
    if (Number.isFinite(first)) hours.push((first - contact.addedAt) / HOUR);
  }
  if (hours.length >= MIN_SAMPLE) {
    const middle = Math.round(median(hours)!);
    add({ label: "Typical time to first reply to a new lead", value: middle, display: `${middle} hours`, computed: true, formula: `the middle of ${hours.length} new leads' first call, text or email`, period });
  } else missing.push(`${NOT_ENOUGH_DATA} for speed to first reply: ${plural(hours.length, "new lead")} with a first call, text or email on record.`);

  // ---- Where won deals come from ----
  const sources = new Map<string, { count: number; value: number }>();
  for (const deal of won) {
    const key = deal.source ?? "No source recorded";
    const row = sources.get(key) ?? { count: 0, value: 0 };
    sources.set(key, { count: row.count + 1, value: row.value + deal.value });
  }
  for (const [source, row] of [...sources].sort((a, b) => b[1].value - a[1].value).slice(0, 3)) {
    add({ label: `Won from ${source}`, value: row.count, display: `${row.count} (${money(row.value, crm.currency)})`, computed: true, formula: `won deals whose source is ${source}`, period });
  }

  // ---- The stall: most quiet deals; else the slowest stage with a sample ----
  const byStalled = [...stages].filter((row) => row.stalled > 0).sort((a, b) => b.stalled - a.stalled || b.stalledValue - a.stalledValue || a.order - b.order)[0];
  const bySlow = [...stages].filter((row) => row.medianDays !== null).sort((a, b) => b.medianDays! - a.medianDays! || a.order - b.order)[0];
  const stall = byStalled
    ? { stageRef: byStalled.ref, name: byStalled.name, why: "stalled" as const }
    : bySlow
      ? { stageRef: bySlow.ref, name: bySlow.name, why: "slowest" as const }
      : null;

  if (otherPipelines > 0) missing.push(`${plural(otherPipelines, "other pipeline")} in ${crm.label} were not reviewed this time.`);
  if (input.stageHistory === "diffed") missing.push(`Stage moves are found by comparing one read of ${crm.label} with the last, so a deal that moved twice between reads counts once.`);

  return { projectId, hasData: true, crm, pipeline: pipelineRef, otherPipelines, windowDays, stalledDays, stages, stall, figures, missing };
}
