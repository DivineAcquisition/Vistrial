import { stableStringify, shortHash } from "@/lib/config/resolve";
import { approvedInput, type ApprovedInputKey } from "@/lib/assay/inputs";
import { PART_BASE, SOURCE_MIN_CLOSED, type AssayRules, type CallRule, type EngagementRule, type FitRule } from "@/lib/assay/rules";
import {
  CONFIDENCE_RANK,
  LEAD_ACTION_EVENTS,
  type CallSignal,
  type Confidence,
  type EngagementEvent,
  type Part,
} from "@/lib/assay/vocabulary";

/**
 * Assay's score, from rules and activity metadata only. Pure: no database,
 * no clock (the time is an input), no AI. The same input, rules, and time
 * always give the same result.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type FieldValue = string | number | boolean | null;

export type Evidence =
  | { kind: "activity"; id: string; at: string }
  | { kind: "field"; input: ApprovedInputKey }
  | { kind: "call"; callId: string; at: string; passageIds: string[] };

export type AssayActivity = { id: string; event: EngagementEvent; at: string };

/** A message or call from the team to the lead. Only used to measure the lead's replies and silence. */
export type TeamTouch = { id: string; at: string };

export type SignalReading = {
  callId: string;
  at: string;
  signal: CallSignal;
  value: string;
  confidence: Confidence;
  passageIds: string[];
};

export type AssayInput = {
  leadId: string;
  /** Approved inputs only. The loader drops everything else before it gets here. */
  fields: Partial<Record<ApprovedInputKey, FieldValue>>;
  activities: AssayActivity[];
  teamTouches: TeamTouch[];
  calls: { held: number; pending: boolean };
  signals: SignalReading[];
  /** How the lead's source has done here. Null when the lead has no source. */
  source: { label: string; closed: number; won: number; overallClosed: number; overallWon: number } | null;
};

export type ReasonHit = {
  ruleId: string;
  part: Part;
  text: string;
  /** Points after decay or aging, before the part weight. */
  points: number;
  /** Share of the final score this reason moved, after the part weight. */
  impact: number;
  callBased: boolean;
  evidence: Evidence[];
};

export type PartResult = {
  part: Part;
  score: number;
  available: boolean;
  informed: boolean;
  weight: number;
  hits: ReasonHit[];
};

export type AssayResult = {
  score: number;
  early: boolean;
  noCall: boolean;
  callPending: boolean;
  parts: Record<Part, PartResult>;
  raising: ReasonHit[];
  lowering: ReasonHit[];
  /** Call signals below the confidence threshold. Listed as "Unclear from the call". */
  unclear: CallSignal[];
  notes: string[];
  rulesVersion: string;
  inputsHash: string;
};

function ms(at: string): number {
  const value = Date.parse(at);
  return Number.isFinite(value) ? value : NaN;
}

function days(from: number, to: number): number {
  return Math.max(0, (to - from) / DAY_MS);
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match)).trim();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isMissing(value: FieldValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

/* ---------------------------------------------------------------------------
 * Fit
 * ------------------------------------------------------------------------- */

function fitHit(rule: FitRule, input: AssayInput): { points: number; text: string } | null {
  const value = input.fields[rule.input];
  const label = approvedInput(rule.input)?.label ?? rule.input;

  if (rule.op === "source_quality") {
    const source = input.source;
    if (!source || source.closed < SOURCE_MIN_CLOSED || source.overallClosed <= 0 || source.overallWon <= 0) return null;
    const ratio = source.won / source.closed / (source.overallWon / source.overallClosed);
    const magnitude = Math.abs(rule.points);
    const points = Math.max(-magnitude, Math.min(magnitude, Math.round((ratio - 1) * magnitude)));
    if (points === 0) return null;
    return {
      points,
      text:
        points > 0
          ? fill(rule.reason || "Leads from {source} usually close well here.", { source: source.label })
          : fill("Leads from {source} close less often here.", { source: source.label }),
    };
  }

  if (isMissing(value)) {
    if (rule.missing !== "negative" || rule.points === 0) return null;
    return { points: -Math.abs(rule.points), text: `${label} is not known yet.` };
  }

  let fires = false;
  const threshold = rule.value === null ? NaN : Number(rule.value);
  switch (rule.op) {
    case "is_true":
      fires = value === true;
      break;
    case "is_false":
      fires = value === false;
      break;
    case "gte":
      fires = typeof value === "number" && Number.isFinite(threshold) && value >= threshold;
      break;
    case "lte":
      fires = typeof value === "number" && Number.isFinite(threshold) && value <= threshold;
      break;
    case "equals":
      fires = rule.value !== null && String(value).trim().toLowerCase() === rule.value.trim().toLowerCase();
      break;
  }
  if (!fires || rule.points === 0) return null;
  return { points: rule.points, text: fill(rule.reason || label, { value: String(value) }) };
}

function knownFitInputs(input: AssayInput): number {
  return (Object.keys(input.fields) as ApprovedInputKey[]).filter(
    (key) => key !== "lead_source" && !isMissing(input.fields[key])
  ).length;
}

/* ---------------------------------------------------------------------------
 * Engagement
 * ------------------------------------------------------------------------- */

type Timeline = {
  now: number;
  /** Lead actions, oldest first. */
  actions: number[];
  lastAction: number | null;
};

function timeline(input: AssayInput, now: number): Timeline {
  const actions = input.activities
    .filter((activity) => LEAD_ACTION_EVENTS.has(activity.event))
    .map((activity) => ms(activity.at))
    .filter((at) => Number.isFinite(at) && at <= now)
    .sort((a, b) => a - b);
  return { now, actions, lastAction: actions.length ? actions[actions.length - 1] : null };
}

/**
 * Positive points fade by half for each half-life of silence since the lead
 * last acted. They never grow back on their own.
 */
function positiveFactor(rules: AssayRules, at: number, t: Timeline): number {
  const reference = Math.max(at, t.lastAction ?? -Infinity);
  return Math.pow(0.5, days(reference, t.now) / rules.halfLifeDays);
}

/**
 * Negative points do not fade. They stop counting only once the lead acts
 * again at least negativeExpiryDays after them, so a quiet lead never drifts up.
 */
function negativeStillCounts(rules: AssayRules, at: number, t: Timeline): boolean {
  const expiresOnActionAfter = at + rules.negativeExpiryDays * DAY_MS;
  return !t.actions.some((action) => action >= expiresOnActionAfter);
}

type Occurrence = { at: number; evidence: Evidence };

function occurrencesFor(rule: EngagementRule, input: AssayInput, t: Timeline): Occurrence[] {
  const inWindow = (at: number) => Number.isFinite(at) && at <= t.now;
  if (rule.kind === "replied_fast") {
    const limit = (rule.minutes ?? 15) * 60 * 1000;
    const touches = input.teamTouches.map((touch) => ms(touch.at)).filter(Number.isFinite).sort((a, b) => a - b);
    const out: Occurrence[] = [];
    for (const activity of input.activities) {
      if (activity.event !== "replied") continue;
      const at = ms(activity.at);
      if (!inWindow(at)) continue;
      let previous = -Infinity;
      for (const touch of touches) {
        if (touch < at) previous = touch;
        else break;
      }
      if (previous > -Infinity && at - previous <= limit) {
        out.push({ at, evidence: { kind: "activity", id: activity.id, at: activity.at } });
      }
    }
    return out;
  }
  return input.activities
    .filter((activity) => activity.event === rule.kind)
    .map((activity) => ({ at: ms(activity.at), evidence: { kind: "activity", id: activity.id, at: activity.at } as Evidence }))
    .filter((occurrence) => inWindow(occurrence.at));
}

function engagementHit(rule: EngagementRule, input: AssayInput, rules: AssayRules, t: Timeline): Omit<ReasonHit, "impact" | "part" | "callBased"> | null {
  if (rule.points === 0) return null;

  if (rule.kind === "no_reply") {
    const after = t.lastAction ?? -Infinity;
    const unanswered = input.teamTouches
      .map((touch) => ({ touch, at: ms(touch.at) }))
      .filter((row) => Number.isFinite(row.at) && row.at > after && row.at <= t.now)
      .sort((a, b) => a.at - b.at)[0];
    if (!unanswered) return null;
    const quiet = Math.floor(days(unanswered.at, t.now));
    if (quiet < (rule.days ?? 14)) return null;
    return {
      ruleId: rule.id,
      text: fill(rule.reason || "No reply in {days} days.", { days: quiet }),
      points: rule.points,
      evidence: [{ kind: "activity", id: unanswered.touch.id, at: unanswered.touch.at }],
    };
  }

  if (rule.kind === "two_way") {
    const window = (rule.days ?? 14) * DAY_MS;
    const replies = input.activities
      .filter((activity) => activity.event === "replied")
      .map((activity) => ({ activity, at: ms(activity.at) }))
      .filter((row) => Number.isFinite(row.at) && row.at <= t.now && row.at >= t.now - window)
      .sort((a, b) => b.at - a.at);
    if (replies.length < (rule.minCount ?? 2)) return null;
    const points = rule.points > 0 ? rule.points * positiveFactor(rules, replies[0].at, t) : rule.points;
    return {
      ruleId: rule.id,
      text: fill(rule.reason || "Replied {count} times in the last {days} days.", { count: replies.length, days: rule.days ?? 14 }),
      points: round1(points),
      evidence: replies.slice(0, 3).map((row) => ({ kind: "activity", id: row.activity.id, at: row.activity.at }) as Evidence),
    };
  }

  const lookbackStart = t.now - rules.lookbackDays * DAY_MS;
  const occurrences = occurrencesFor(rule, input, t)
    .filter((occurrence) =>
      rule.points > 0 ? occurrence.at >= lookbackStart : negativeStillCounts(rules, occurrence.at, t)
    )
    .sort((a, b) => b.at - a.at)
    .slice(0, rule.maxCount);
  if (!occurrences.length) return null;

  const points = occurrences.reduce(
    (sum, occurrence) => sum + (rule.points > 0 ? rule.points * positiveFactor(rules, occurrence.at, t) : rule.points),
    0
  );
  if (Math.abs(points) < 0.05) return null;
  const count = occurrences.length;
  return {
    ruleId: rule.id,
    text: fill(rule.reason, { count, count_text: count === 1 ? "once" : `${count} times`, minutes: rule.minutes ?? 15 }),
    points: round1(points),
    evidence: occurrences.map((occurrence) => occurrence.evidence),
  };
}

/* ---------------------------------------------------------------------------
 * Call signals
 * ------------------------------------------------------------------------- */

const MULTI_VALUE: ReadonlySet<CallSignal> = new Set(["buying_intent", "red_flag"]);

function currentSignals(readings: SignalReading[], threshold: Confidence, now: number) {
  const usable: SignalReading[] = [];
  const unclear = new Set<CallSignal>();
  for (const reading of readings) {
    const at = ms(reading.at);
    if (!Number.isFinite(at) || at > now) continue;
    if (CONFIDENCE_RANK[reading.confidence] >= CONFIDENCE_RANK[threshold]) usable.push(reading);
    else unclear.add(reading.signal);
  }
  const newest = new Map<string, SignalReading>();
  for (const reading of usable.sort((a, b) => ms(a.at) - ms(b.at))) {
    const key = MULTI_VALUE.has(reading.signal) ? `${reading.signal}:${reading.value}` : reading.signal;
    newest.set(key, reading);
  }
  for (const reading of newest.values()) unclear.delete(reading.signal);
  return { current: [...newest.values()], unclear: [...unclear].sort() };
}

/** Positive call signals count in full for 60 days, at half to 120, then not at all. Negative ones hold until a newer call. */
function signalFactor(rules: AssayRules, rule: CallRule, at: number, now: number): number {
  if (rule.points < 0) return 1;
  const age = days(at, now);
  if (age > rules.signalDropAfterDays) return 0;
  if (age > rules.signalHalfAfterDays) return 0.5;
  return 1;
}

/* ---------------------------------------------------------------------------
 * The score
 * ------------------------------------------------------------------------- */

function clampPart(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function computeAssayScore(input: AssayInput, rules: AssayRules, nowIso: string): AssayResult {
  const now = ms(nowIso);
  if (!Number.isFinite(now)) throw new Error("Assay needs a valid time to score against.");
  const t = timeline(input, now);

  // Fit.
  const fitHits: Array<Omit<ReasonHit, "impact" | "part" | "callBased">> = [];
  for (const rule of rules.fit) {
    if (!rule.enabled) continue;
    const hit = fitHit(rule, input);
    if (!hit) continue;
    const evidence: Evidence[] = rule.op === "source_quality" ? [{ kind: "field", input: "lead_source" }] : [{ kind: "field", input: rule.input }];
    fitHits.push({ ruleId: rule.id, text: hit.text, points: hit.points, evidence });
  }

  // Engagement. Team activity alone never raises it: every positive rule reads lead actions.
  const engagementHits: Array<Omit<ReasonHit, "impact" | "part" | "callBased">> = [];
  for (const rule of rules.engagement) {
    if (!rule.enabled) continue;
    const hit = engagementHit(rule, input, rules, t);
    if (hit) engagementHits.push(hit);
  }

  // Call signals.
  const { current, unclear } = currentSignals(input.signals, rules.confidence, now);
  const callHits: Array<Omit<ReasonHit, "impact" | "part" | "callBased">> = [];
  for (const reading of current) {
    const at = ms(reading.at);
    for (const rule of rules.call) {
      if (!rule.enabled || rule.signal !== reading.signal || rule.value !== reading.value || rule.points === 0) continue;
      const factor = signalFactor(rules, rule, at, now);
      if (factor === 0) continue;
      callHits.push({
        ruleId: rule.id,
        text: rule.reason,
        points: round1(rule.points * factor),
        evidence: [{ kind: "call", callId: reading.callId, at: reading.at, passageIds: reading.passageIds }],
      });
    }
  }

  // Once a call gave something clear, the call part stays in the blend. Old
  // signals fade to neutral rather than dropping out, so a quiet lead cannot
  // rise just because its last call aged.
  const callAvailable = input.calls.held > 0 && current.length > 0;
  const noCall = input.calls.held === 0 && !input.calls.pending;
  const callPending = input.calls.pending && !callAvailable;

  const raw: Record<Part, { score: number; available: boolean; informed: boolean; hits: typeof fitHits }> = {
    fit: {
      score: clampPart(PART_BASE + fitHits.reduce((sum, hit) => sum + hit.points, 0)),
      available: true,
      informed: knownFitInputs(input) >= 2,
      hits: fitHits,
    },
    engagement: {
      score: clampPart(PART_BASE + engagementHits.reduce((sum, hit) => sum + hit.points, 0)),
      available: true,
      informed: t.actions.length > 0,
      hits: engagementHits,
    },
    call: {
      score: clampPart(PART_BASE + callHits.reduce((sum, hit) => sum + hit.points, 0)),
      available: callAvailable,
      informed: callAvailable,
      hits: callHits,
    },
  };

  // With no usable call, the call weight is shared between fit and engagement in proportion.
  const parts: Part[] = ["fit", "engagement", "call"];
  const weightSum = parts.reduce((sum, part) => sum + (raw[part].available ? rules.weights[part] : 0), 0);
  const share = (part: Part) => (raw[part].available && weightSum > 0 ? rules.weights[part] / weightSum : 0);

  const blended = weightSum > 0 ? parts.reduce((sum, part) => sum + raw[part].score * share(part), 0) : PART_BASE;
  const score = Math.max(0, Math.min(100, Math.round(blended)));

  const result = {} as Record<Part, PartResult>;
  const allHits: ReasonHit[] = [];
  for (const part of parts) {
    const hits = raw[part].hits.map((hit) => ({
      ...hit,
      part,
      callBased: part === "call",
      impact: round1(hit.points * share(part)),
    }));
    if (raw[part].available) allHits.push(...hits);
    result[part] = {
      part,
      score: Math.round(raw[part].score),
      available: raw[part].available,
      informed: raw[part].informed,
      weight: Math.round(share(part) * 100),
      hits,
    };
  }

  const informedParts = parts.filter((part) => raw[part].available && raw[part].informed).length;
  const early = informedParts < 2;

  const byImpact = (a: ReasonHit, b: ReasonHit) => Math.abs(b.impact) - Math.abs(a.impact) || a.ruleId.localeCompare(b.ruleId);
  const raising = allHits.filter((hit) => hit.impact > 0).sort(byImpact).slice(0, 3);
  const lowering = allHits.filter((hit) => hit.impact < 0).sort(byImpact).slice(0, 2);

  const notes: string[] = [];
  if (callPending) notes.push("Call details pending.");
  else if (noCall) notes.push("No call yet. Score is based on fit and activity.");
  else if (!callAvailable) notes.push("Nothing from the call was clear enough to score.");
  if (early) notes.push("Early score. There is not much to go on yet.");

  return {
    score,
    early,
    noCall,
    callPending,
    parts: result,
    raising,
    lowering,
    unclear,
    notes,
    rulesVersion: rules.version,
    inputsHash: `i${shortHash(stableStringify({ input, version: rules.version, now: nowIso }))}`,
  };
}
