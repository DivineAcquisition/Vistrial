/**
 * Growth Diagnostics' arithmetic, in code and nowhere else: funnel rates, cost per result, and changes
 * between periods, from the business's own figures. Pure functions, so every number can be tested. The
 * model is handed these figures and their source ids; it never works a number out itself.
 */

import type { Doc } from "../../_generated/dataModel";
import { changesBetween, type Figures } from "../../decisions";
import { STAGES, type DecisionLine, type Figure, type Stage } from "./shapes";

/** Campaigns and upload groups looked at one by one, highest spend first. */
const TOP_ROWS = 5;
const TOP_GROUPS = 3;
/** Results files read, newest label first. */
const MAX_LABELS = 3;
/** The daily series is split into two halves only when it has at least this many days. */
export const MIN_DAYS_FOR_TREND = 14;

export type MetaState = "none" | "needsReconnect" | "notGranted" | "noAccount" | "noSpend" | "ok";

export type MetaInput = {
  snapshot: Pick<Doc<"metaAdSnapshots">, "currency" | "dateStart" | "dateStop" | "totals" | "daily" | "campaigns">;
  account: string;
  accountSourceId: string;
  /** Campaign id to its "Your data" source id. Only campaigns saved as sources are listed. */
  campaignSourceIds: Record<string, string>;
};

export type UploadInput = { upload: Pick<Doc<"resultUploads">, "_id" | "label" | "fileName" | "currency" | "summary" | "createdAt">; sourceId: string };

export type DecisionInput = {
  decision: Pick<Doc<"decisions">, "_id" | "proposedAction" | "baseline" | "outcome" | "checkInAt">;
  sourceId: string;
  /** describeDecision's line. */
  text: string;
  /** Changes measured from the decision's baseline, to its recorded outcome or, while open, to now. */
  changes: ReturnType<typeof changesBetween>;
  measuredTo: "outcome" | "now";
};

export function money(value: number, currency: string) {
  const digits = Math.abs(value) >= 1000 ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

export function count(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** A share as a percentage with two decimals: 0.0126 reads "1.26%". */
export function pct(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

/** A change as a signed percentage with one decimal: +12.5%, -8.0%. */
export function change(before: number, after: number) {
  const value = Math.round(((after - before) / Math.abs(before)) * 1000) / 10;
  return { value, display: `${value > 0 ? "+" : ""}${value.toFixed(1)}%` };
}

function ratio(value: number) {
  return `${value.toFixed(2)}x`;
}

/** Rounds a stored value so it reads the same as its display. */
function round(value: number, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

const METRIC_STAGE: Record<string, Stage> = { spend: "reach", conversions: "leads", revenue: "revenue" };

class FigureList {
  readonly rows: Figure[] = [];
  add(row: Omit<Figure, "id">) {
    const figure = { ...row, value: round(row.value), id: `F${this.rows.length + 1}` };
    this.rows.push(figure);
    return figure;
  }
}

function metaFigures(list: FigureList, meta: MetaInput) {
  const { snapshot, account } = meta;
  const cur = snapshot.currency;
  const src = [meta.accountSourceId];
  const period = `${snapshot.dateStart} to ${snapshot.dateStop}`;
  const t = snapshot.totals;
  const base = { origin: "meta" as const, period };
  const name = `Meta ads (${account})`;

  const spend = list.add({ ...base, stage: "reach", label: `${name}: spend`, value: t.spend, display: money(t.spend, cur), computed: false, sourceRefIds: src });
  const impressions = t.impressions > 0 ? list.add({ ...base, stage: "reach", label: `${name}: impressions`, value: t.impressions, display: count(t.impressions), computed: false, sourceRefIds: src }) : null;
  if (t.reach > 0) {
    const reach = list.add({ ...base, stage: "reach", label: `${name}: people reached`, value: t.reach, display: count(t.reach), computed: false, sourceRefIds: src });
    if (impressions) {
      const frequency = t.impressions / t.reach;
      list.add({ ...base, stage: "reach", label: `${name}: times each person saw an ad`, value: frequency, display: frequency.toFixed(2), computed: true, formula: `${impressions.display} impressions ÷ ${reach.display} people reached`, sourceRefIds: src });
    }
  }
  if (t.clicks > 0) {
    const clicks = list.add({ ...base, stage: "clicks", label: `${name}: clicks`, value: t.clicks, display: count(t.clicks), computed: false, sourceRefIds: src });
    if (impressions) {
      const ctr = t.clicks / t.impressions;
      list.add({ ...base, stage: "clicks", label: `${name}: click-through rate`, value: ctr, display: pct(ctr), computed: true, formula: `${clicks.display} clicks ÷ ${impressions.display} impressions`, sourceRefIds: src });
    }
    const cpc = t.spend / t.clicks;
    list.add({ ...base, stage: "clicks", label: `${name}: cost per click`, value: cpc, display: money(cpc, cur), computed: true, formula: `${spend.display} spend ÷ ${clicks.display} clicks`, sourceRefIds: src });
  }

  // Results, only from campaigns Meta reports a result for.
  const withResults = snapshot.campaigns.filter((row) => row.results !== null && row.resultLabel && row.spend > 0);
  if (withResults.length > 0) {
    const labels = new Set(withResults.map((row) => row.resultLabel!.toLowerCase()));
    const word = labels.size === 1 ? [...labels][0] : "results";
    const results = withResults.reduce((sum, row) => sum + (row.results ?? 0), 0);
    const resultSpend = withResults.reduce((sum, row) => sum + row.spend, 0);
    const resultClicks = withResults.reduce((sum, row) => sum + row.clicks, 0);
    const n = withResults.length;
    const total = list.add({
      ...base,
      stage: "leads",
      label: `${name}: ${word}`,
      value: results,
      display: count(results),
      computed: n > 1,
      ...(n > 1 ? { formula: `sum of ${word} over ${n} campaigns` } : {}),
      sourceRefIds: src,
    });
    if (results > 0) {
      const cpr = resultSpend / results;
      list.add({ ...base, stage: "leads", label: `${name}: cost per ${word.replace(/s$/, "")}`, value: cpr, display: money(cpr, cur), computed: true, formula: `${money(resultSpend, cur)} spend ÷ ${total.display} ${word}`, sourceRefIds: src });
    }
    if (resultClicks > 0) {
      const rate = results / resultClicks;
      list.add({ ...base, stage: "leads", label: `${name}: clicks that became ${word}`, value: rate, display: pct(rate), computed: true, formula: `${total.display} ${word} ÷ ${count(resultClicks)} clicks`, sourceRefIds: src });
    }
  }

  // Campaign by campaign: what Meta reports, and the click-to-result rate worked out here.
  const campaigns = snapshot.campaigns
    .filter((row) => row.spend > 0 && meta.campaignSourceIds[row.id])
    .sort((a, b) => b.spend - a.spend)
    .slice(0, TOP_ROWS);
  for (const row of campaigns) {
    const csrc = [meta.campaignSourceIds[row.id]];
    const cname = `Meta campaign "${row.name}"`;
    list.add({ ...base, stage: "reach", label: `${cname}: spend`, value: row.spend, display: money(row.spend, cur), computed: false, sourceRefIds: csrc });
    if (row.impressions > 0 && row.clicks > 0) {
      const ctr = row.clicks / row.impressions;
      list.add({ ...base, stage: "clicks", label: `${cname}: click-through rate`, value: ctr, display: pct(ctr), computed: true, formula: `${count(row.clicks)} clicks ÷ ${count(row.impressions)} impressions`, sourceRefIds: csrc });
    }
    if (row.results === null || !row.resultLabel) continue;
    const word = row.resultLabel.toLowerCase();
    list.add({ ...base, stage: "leads", label: `${cname}: ${word}`, value: row.results, display: count(row.results), computed: false, sourceRefIds: csrc });
    if (row.costPerResult !== null) {
      list.add({ ...base, stage: "leads", label: `${cname}: cost per ${word.replace(/s$/, "")}`, value: row.costPerResult, display: money(row.costPerResult, cur), computed: false, sourceRefIds: csrc });
    }
    if (row.clicks > 0) {
      const rate = row.results / row.clicks;
      list.add({ ...base, stage: "leads", label: `${cname}: clicks that became ${word}`, value: rate, display: pct(rate), computed: true, formula: `${count(row.results)} ${word} ÷ ${count(row.clicks)} clicks`, sourceRefIds: csrc });
    }
  }

  // The daily series in two equal halves, earlier against later.
  const days = [...snapshot.daily].sort((a, b) => a.date.localeCompare(b.date));
  if (days.length >= MIN_DAYS_FOR_TREND) {
    const half = Math.floor(days.length / 2);
    const first = days.slice(0, half);
    const second = days.slice(days.length - half);
    const sum = (rows: typeof days) => rows.reduce((acc, row) => ({ spend: acc.spend + row.spend, impressions: acc.impressions + row.impressions, clicks: acc.clicks + row.clicks }), { spend: 0, impressions: 0, clicks: 0 });
    const a = sum(first);
    const b = sum(second);
    const periods = `${first[0].date} to ${first[first.length - 1].date} vs ${second[0].date} to ${second[second.length - 1].date}`;
    const trend = { origin: "meta" as const, period: periods, sourceRefIds: src, computed: true };
    if (a.impressions > 0 && b.impressions > 0) {
      const delta = change(a.impressions, b.impressions);
      list.add({ ...trend, stage: "reach", label: `${name}: change in impressions, earlier ${half} days to later ${half} days`, value: delta.value, display: delta.display, formula: `${count(a.impressions)} → ${count(b.impressions)} impressions` });
      if (a.clicks > 0 && b.clicks > 0) {
        const ctrA = a.clicks / a.impressions;
        const ctrB = b.clicks / b.impressions;
        const delta2 = change(ctrA, ctrB);
        list.add({ ...trend, stage: "clicks", label: `${name}: change in click-through rate, earlier ${half} days to later ${half} days`, value: delta2.value, display: delta2.display, formula: `${pct(ctrA)} → ${pct(ctrB)}` });
      }
    }
    if (a.clicks > 0 && b.clicks > 0) {
      const cpcA = a.spend / a.clicks;
      const cpcB = b.spend / b.clicks;
      const delta = change(cpcA, cpcB);
      list.add({ ...trend, stage: "clicks", label: `${name}: change in cost per click, earlier ${half} days to later ${half} days`, value: delta.value, display: delta.display, formula: `${money(cpcA, cur)} → ${money(cpcB, cur)}` });
    }
  }
}

/** An upload's totals in the shape decisions compare, so a newer file can be compared with an older one. */
function asFigures(upload: UploadInput["upload"]): Figures {
  const totals = upload.summary!.totals;
  return {
    source: "upload",
    label: upload.label,
    currency: upload.currency,
    dateStart: upload.summary!.dateStart,
    dateStop: upload.summary!.dateStop,
    ...(totals.spend !== undefined ? { spend: totals.spend } : {}),
    ...(totals.conversions !== undefined ? { conversions: totals.conversions } : {}),
    ...(totals.revenue !== undefined ? { revenue: totals.revenue } : {}),
    capturedAt: upload.createdAt,
  };
}

function periodOf(upload: UploadInput["upload"]) {
  const s = upload.summary;
  return s?.dateStart && s.dateStop ? `${s.dateStart} to ${s.dateStop}` : undefined;
}

function uploadFigures(list: FigureList, current: UploadInput, previous: UploadInput | null) {
  const { upload } = current;
  const summary = upload.summary!;
  const cur = upload.currency;
  const src = [current.sourceId];
  const period = periodOf(upload);
  const base = { origin: "upload" as const, sourceRefIds: src, ...(period ? { period } : {}) };
  const name = `${upload.label} (your file)`;
  const t = summary.totals;

  const spend = t.spend !== undefined ? list.add({ ...base, stage: "reach", label: `${name}: spend`, value: t.spend, display: money(t.spend, cur), computed: false }) : null;
  const impressions = t.impressions ? list.add({ ...base, stage: "reach", label: `${name}: impressions`, value: t.impressions, display: count(t.impressions), computed: false }) : null;
  const clicks = t.clicks ? list.add({ ...base, stage: "clicks", label: `${name}: clicks`, value: t.clicks, display: count(t.clicks), computed: false }) : null;
  const conversions = t.conversions !== undefined ? list.add({ ...base, stage: "leads", label: `${name}: conversions`, value: t.conversions, display: count(t.conversions), computed: false }) : null;
  const revenue = t.revenue !== undefined ? list.add({ ...base, stage: "revenue", label: `${name}: revenue`, value: t.revenue, display: money(t.revenue, cur), computed: false }) : null;

  if (impressions && clicks) {
    const ctr = clicks.value / impressions.value;
    list.add({ ...base, stage: "clicks", label: `${name}: click-through rate`, value: ctr, display: pct(ctr), computed: true, formula: `${clicks.display} clicks ÷ ${impressions.display} impressions` });
  }
  if (spend && clicks) {
    const cpc = spend.value / clicks.value;
    list.add({ ...base, stage: "clicks", label: `${name}: cost per click`, value: cpc, display: money(cpc, cur), computed: true, formula: `${spend.display} spend ÷ ${clicks.display} clicks` });
  }
  if (clicks && conversions) {
    const rate = conversions.value / clicks.value;
    list.add({ ...base, stage: "leads", label: `${name}: clicks that converted`, value: rate, display: pct(rate), computed: true, formula: `${conversions.display} conversions ÷ ${clicks.display} clicks` });
  }
  if (spend && conversions && conversions.value > 0) {
    const cpa = spend.value / conversions.value;
    list.add({ ...base, stage: "leads", label: `${name}: cost per conversion`, value: cpa, display: money(cpa, cur), computed: true, formula: `${spend.display} spend ÷ ${conversions.display} conversions` });
  }
  if (revenue && conversions && conversions.value > 0) {
    const rpc = revenue.value / conversions.value;
    list.add({ ...base, stage: "revenue", label: `${name}: revenue per conversion`, value: rpc, display: money(rpc, cur), computed: true, formula: `${revenue.display} revenue ÷ ${conversions.display} conversions` });
  }
  if (revenue && spend && spend.value > 0) {
    const roas = revenue.value / spend.value;
    list.add({ ...base, stage: "revenue", label: `${name}: revenue for each unit spent`, value: roas, display: ratio(roas), computed: true, formula: `${revenue.display} revenue ÷ ${spend.display} spend` });
  }

  // Group by group (campaign or channel), highest spend first.
  const groups = [...summary.groups].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)).slice(0, TOP_GROUPS);
  const by = summary.groupBy ? summary.groupBy.toLowerCase() : "group";
  for (const group of groups) {
    const gname = `${upload.label} ${by} "${group.name}"`;
    const gspend = group.spend !== undefined ? list.add({ ...base, stage: "reach", label: `${gname}: spend`, value: group.spend, display: money(group.spend, cur), computed: false }) : null;
    const gconv = group.conversions !== undefined ? list.add({ ...base, stage: "leads", label: `${gname}: conversions`, value: group.conversions, display: count(group.conversions), computed: false }) : null;
    if (gspend && gconv && gconv.value > 0) {
      const cpa = gspend.value / gconv.value;
      list.add({ ...base, stage: "leads", label: `${gname}: cost per conversion`, value: cpa, display: money(cpa, cur), computed: true, formula: `${gspend.display} spend ÷ ${gconv.display} conversions` });
    }
    if (group.clicks && gconv) {
      const rate = gconv.value / group.clicks;
      list.add({ ...base, stage: "leads", label: `${gname}: clicks that converted`, value: rate, display: pct(rate), computed: true, formula: `${gconv.display} conversions ÷ ${count(group.clicks)} clicks` });
    }
  }

  // An older file with the same label: period over period, measured the way decisions are.
  if (previous?.upload.summary) {
    const before = periodOf(previous.upload) ?? previous.upload.fileName;
    const after = period ?? upload.fileName;
    for (const row of changesBetween([asFigures(previous.upload)], [asFigures(upload)])) {
      const fmt = (value: number) => (row.metric === "conversions" ? count(value) : money(value, cur));
      list.add({
        origin: "upload",
        stage: METRIC_STAGE[row.metric],
        label: `${upload.label}: change in ${row.metric}, earlier file to newer file`,
        value: row.percent,
        display: `${row.percent > 0 ? "+" : ""}${row.percent.toFixed(1)}%`,
        computed: true,
        formula: `${fmt(row.before)} → ${fmt(row.after)}`,
        period: `${before} vs ${after}`,
        sourceRefIds: [previous.sourceId, current.sourceId],
      });
    }
  }
}

function decisionFigures(list: FigureList, input: DecisionInput) {
  const action = input.decision.proposedAction.replace(/\s+/g, " ").trim().slice(0, 80);
  for (const row of input.changes) {
    const fmt = (value: number) => (row.metric === "conversions" ? count(value) : money(value, input.decision.baseline.find((f) => f.label === row.label)?.currency ?? "USD"));
    list.add({
      origin: "decision",
      stage: METRIC_STAGE[row.metric],
      label: `After "${action}": ${row.label} ${row.metric} ${input.measuredTo === "outcome" ? "at the check-in" : "so far"}`,
      value: row.percent,
      display: `${row.percent > 0 ? "+" : ""}${row.percent.toFixed(1)}%`,
      computed: true,
      formula: `${fmt(row.before)} → ${fmt(row.after)}`,
      sourceRefIds: [input.sourceId],
    });
  }
}

const CONNECT_META = "connect your Meta ad account under Connections → Meta ads and allow the Growth Architect to use it";
const UPLOAD = "upload a results file under Connections → Results files (a CSV export from Google Ads, your CRM or your bookings tool)";

const META_WORDS: Record<MetaState, string> = {
  none: `Connect your Meta ad account under Connections → Meta ads and allow the Growth Architect to use it.`,
  needsReconnect: "Reconnect your Meta ad account under Connections → Meta ads: its access has expired.",
  notGranted: "Allow the Growth Architect to use your Meta ad account under Connections → Meta ads.",
  noAccount: "Choose which Meta ad account to read under Connections → Meta ads.",
  noSpend: "Your Meta ad account shows no spend in its last read. Refresh it under Connections → Meta ads once ads have run.",
  ok: "",
};

const STAGE_MISSING: Record<Stage, string> = {
  reach: `Not enough data on reach: ${CONNECT_META}, or ${UPLOAD} with an impressions column.`,
  clicks: `Not enough data on clicks: ${CONNECT_META}, or ${UPLOAD} with a clicks column.`,
  leads: `Not enough data on leads or bookings: ${UPLOAD} with a conversions, leads or bookings column.`,
  revenue: `Not enough data on revenue: ${UPLOAD} with a revenue column, for example from your bookings tool, CRM or accounts.`,
};

export type ComputeInput = {
  meta: MetaInput | null;
  metaState: MetaState;
  /** Ready uploads granted to the agent, newest first. */
  uploads: UploadInput[];
  decisions: DecisionInput[];
};

/** Every figure, the stages they cover, the decision lines, and what to connect for what is missing. */
export function computeDiagnostics(input: ComputeInput) {
  const list = new FigureList();
  if (input.meta) metaFigures(list, input.meta);

  // The newest file per label stands for that source; the one before it, if any, is the earlier period.
  const seen = new Map<string, UploadInput>();
  const previous = new Map<string, UploadInput>();
  for (const row of input.uploads) {
    if (!row.upload.summary) continue;
    if (!seen.has(row.upload.label)) {
      if (seen.size < MAX_LABELS) seen.set(row.upload.label, row);
    }
    else if (!previous.has(row.upload.label)) previous.set(row.upload.label, row);
  }
  for (const [label, row] of seen) uploadFigures(list, row, previous.get(label) ?? null);

  const decisions: DecisionLine[] = [];
  for (const row of input.decisions) {
    decisionFigures(list, row);
    decisions.push({ id: row.decision._id, text: row.text, sourceRefId: row.sourceId, measured: row.changes.length > 0 });
  }

  const figures = list.rows;
  const stagesWithData = STAGES.filter((stage) => figures.some((row) => row.stage === stage));
  // A decision counts as data once its outcome is in and a figure moved that can be measured.
  const measuredDecisions = input.decisions.filter((row) => row.decision.outcome && row.changes.length > 0).length;
  const hasData = input.meta !== null || seen.size > 0 || measuredDecisions > 0;

  const missing: { stage: Stage | "all"; text: string }[] = [];
  if (!hasData) {
    missing.push({
      stage: "all",
      text: "Not enough data: there are no results from this business to diagnose yet. Vistrial needs at least one of these.",
    });
    missing.push({ stage: "all", text: META_WORDS[input.metaState === "ok" ? "none" : input.metaState] });
    missing.push({ stage: "all", text: `Or ${UPLOAD}, with columns for spend, impressions, clicks, conversions or revenue.` });
    missing.push({ stage: "all", text: "Outcomes you record for decisions made after a Growth Architect report also count." });
  } else {
    if (input.metaState !== "ok" && input.metaState !== "none") missing.push({ stage: "all", text: META_WORDS[input.metaState] });
    for (const stage of STAGES) if (!stagesWithData.includes(stage)) missing.push({ stage, text: STAGE_MISSING[stage] });
  }

  return {
    hasData,
    figures,
    stagesWithData,
    decisions,
    missing,
    inputs: { meta: input.meta !== null, uploads: seen.size, decisions: input.decisions.length, measuredDecisions },
  };
}
