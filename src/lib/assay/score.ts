import { createHash } from "node:crypto";

import { assertRulesFair } from "@/lib/assay/fairness";
import { confidenceMeets } from "@/lib/assay/signals";
import type {
  CallSignals,
  Confidence,
  FiredRule,
  PartWeights,
  Ruleset,
  ScoreResult,
  ScoreRule,
  ScoringFacts,
  Tier,
} from "@/lib/assay/types";

const CALL_HALF_DAYS = 60;
const CALL_DROP_DAYS = 120;

export function tierForScore(score: number, tiers: Ruleset["tiers"]): Tier {
  if (score >= tiers.hot) return "hot";
  if (score >= tiers.warm) return "warm";
  if (score >= tiers.cool) return "cool";
  return "cold";
}

export function tierFloor(tier: Tier, tiers: Ruleset["tiers"]): number {
  if (tier === "hot") return tiers.hot;
  if (tier === "warm") return tiers.warm;
  if (tier === "cool") return tiers.cool;
  return 0;
}

/**
 * Move up as soon as the score crosses the line. Move down only after it
 * falls the stickiness gap below that line.
 */
export function stickyTier(score: number, previous: Tier | null, tiers: Ruleset["tiers"]): Tier {
  const raw = tierForScore(score, tiers);
  if (!previous) return raw;
  const order: Tier[] = ["cold", "cool", "warm", "hot"];
  if (order.indexOf(raw) >= order.indexOf(previous)) return raw;
  const floor = tierFloor(previous, tiers);
  if (score > floor - tiers.stickiness) return previous;
  return raw;
}

export function shareCallWeight(weights: PartWeights, hasCall: boolean): PartWeights {
  if (hasCall) return { ...weights };
  const rest = weights.fit + weights.engagement;
  if (rest <= 0) return { fit: weights.fit, engagement: weights.engagement, call: 0 };
  return {
    fit: weights.fit + weights.call * (weights.fit / rest),
    engagement: weights.engagement + weights.call * (weights.engagement / rest),
    call: 0,
  };
}

export function blendParts(parts: { fit: number; engagement: number; call: number }, weights: PartWeights): number {
  const total = (parts.fit * weights.fit + parts.engagement * weights.engagement + parts.call * weights.call) / 100;
  return clamp(Math.round(total), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function decayFactor(silenceDays: number, halfLifeDays: number): number {
  if (silenceDays <= 0 || halfLifeDays <= 0) return 1;
  return 0.5 ** (silenceDays / halfLifeDays);
}

type FactBag = Record<string, string | number | boolean | null>;

function bagFrom(facts: ScoringFacts, call: CallSignals | null, minConfidence: Confidence): { bag: FactBag; unclear: number } {
  const bag: FactBag = {
    serviceMatch: facts.serviceMatch,
    serviceHighValue: facts.serviceHighValue,
    dealValueFit: facts.dealValueFit,
    insideServiceArea: facts.insideServiceArea,
    travelWithinLimit: facts.travelWithinLimit,
    sourceQuality: facts.sourceQuality,
    contactComplete: facts.contactComplete,
    decisionMakerKnown: facts.decisionMakerKnown,
    requestedQuote: facts.requestedQuote,
    booked: facts.booked,
    rescheduledByLead: facts.rescheduledByLead,
    canceled: facts.canceled,
    noShow: facts.noShow,
    completedMeeting: facts.completedMeeting,
    replyMinutes: facts.replyMinutes,
    replyHourOnly: facts.replyMinutes != null && facts.replyMinutes > 10 && facts.replyMinutes <= 60,
    twoWayCount14d: facts.twoWayCount14d,
    openedQuote: facts.openedQuote,
    openedMaterials: facts.openedMaterials,
    reopened: facts.reopened,
    stageMove: facts.stageMove,
    inboundIntent: facts.inboundIntent,
    paidDeposit: facts.paidDeposit,
    applicationSubmitted: facts.applicationSubmitted,
    programMatch: facts.programMatch,
    leadSilenceDays: facts.leadSilenceDays,
    timeline: null,
    budgetFit: null,
    decisionOnCall: null,
    objectionResolved: null,
    buyingIntent: null,
    nextStep: null,
    redFlag: null,
  };
  for (const [key, value] of Object.entries(facts.custom)) {
    bag[`custom_${key}`] = value;
  }
  let unclear = 0;
  if (!call) return { bag, unclear };
  const take = <T extends string>(signal: { value: T; confidence: Confidence }): T | null => {
    if (signal.value === "unknown") return null;
    if (!confidenceMeets(signal.confidence, minConfidence)) {
      unclear += 1;
      return null;
    }
    return signal.value;
  };
  bag.timeline = take(call.timeline);
  bag.budgetFit = take(call.budgetFit);
  bag.decisionOnCall = take(call.decisionMaker);
  bag.objectionResolved = take(call.objectionResolved);
  bag.buyingIntent = take(call.buyingIntent);
  bag.nextStep = take(call.nextStep);
  const flags = call.redFlags.filter((flag) => confidenceMeets(flag.confidence, minConfidence));
  unclear += call.redFlags.length - flags.length;
  bag.redFlag = flags[0]?.value ?? null;
  return { bag, unclear };
}

function readFact(bag: FactBag, key: string): string | number | boolean | null | undefined {
  if (Object.prototype.hasOwnProperty.call(bag, key)) return bag[key];
  return undefined;
}

function matches(rule: ScoreRule, bag: FactBag): "fire" | "missing" | "skip" {
  const value = readFact(bag, rule.when.key);
  if (value == null) return "missing";
  const { op } = rule.when;
  if (op === "true") return value === true ? "fire" : "skip";
  if (op === "false") return value === false ? "fire" : "skip";
  if (op === "eq") return value === rule.when.value ? "fire" : "skip";
  if (typeof value !== "number" || typeof rule.when.value !== "number") return "skip";
  if (op === "gte") return value >= rule.when.value ? "fire" : "skip";
  return value <= rule.when.value ? "fire" : "skip";
}

function partScore(rules: ScoreRule[], part: ScoreRule["part"], bag: FactBag): { score: number; fired: FiredRule[] } {
  let delta = 0;
  const fired: FiredRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.part !== part) continue;
    const result = matches(rule, bag);
    if (result === "skip") continue;
    if (result === "missing") {
      if (rule.missing !== "negative") continue;
      const points = rule.points < 0 ? rule.points : -Math.abs(rule.points);
      delta += points;
      fired.push({ ruleId: rule.id, part, points, reason: rule.reason, callBased: rule.callBased, evidence: rule.evidence, evidenceId: null });
      continue;
    }
    delta += rule.points;
    fired.push({
      ruleId: rule.id,
      part,
      points: rule.points,
      reason: rule.reason,
      callBased: rule.callBased,
      evidence: rule.evidence,
      evidenceId: null,
    });
  }
  return { score: clamp(Math.round(50 + delta), 0, 100), fired };
}

function usableCall(call: CallSignals | null): { call: CallSignals | null; halved: boolean; dropped: boolean } {
  if (!call) return { call: null, halved: false, dropped: false };
  if (call.ageDays > CALL_DROP_DAYS) return { call: null, halved: false, dropped: true };
  return { call, halved: call.ageDays > CALL_HALF_DAYS, dropped: false };
}

function fingerprintOf(rulesetId: string, facts: ScoringFacts, previousTier: Tier | null): string {
  const body = JSON.stringify({ rulesetId, facts, previousTier });
  return createHash("sha256").update(body).digest("hex");
}

export function isEarlyScore(fired: FiredRule[]): boolean {
  const meaningful = fired.filter((item) => item.points !== 0 && item.ruleId !== "contact_complete");
  return meaningful.length < 2;
}

export function scoreLead(args: { facts: ScoringFacts; ruleset: Ruleset; previousTier: Tier | null }): ScoreResult {
  assertRulesFair(args.ruleset.rules);
  const aged = usableCall(args.facts.call);
  const hasCall = Boolean(aged.call) && !args.facts.callPending;
  const { bag, unclear } = bagFrom(args.facts, hasCall ? aged.call : null, args.ruleset.confidenceMin);
  const fit = partScore(args.ruleset.rules, "fit", bag);
  const engagement = partScore(args.ruleset.rules, "engagement", bag);
  const callPart = hasCall ? partScore(args.ruleset.rules, "call", bag) : { score: 0, fired: [] as FiredRule[] };
  const decayedEngagement = clamp(Math.round(engagement.score * decayFactor(args.facts.leadSilenceDays, args.ruleset.decayDays)), 0, 100);
  const callScore = aged.halved ? clamp(Math.round(callPart.score * 0.5), 0, 100) : callPart.score;
  const weightsUsed = shareCallWeight(args.ruleset.weights, hasCall);
  const parts = { fit: fit.score, engagement: decayedEngagement, call: hasCall ? callScore : 0 };
  const score = blendParts(parts, weightsUsed);
  const fired = [...fit.fired, ...engagement.fired, ...callPart.fired];
  const rawTier = tierForScore(score, args.ruleset.tiers);
  const tier = stickyTier(score, args.previousTier, args.ruleset.tiers);
  return {
    score,
    tier,
    rawTier,
    early: isEarlyScore(fired),
    noCall: !hasCall && !args.facts.callPending,
    callPending: args.facts.callPending && !hasCall,
    parts,
    weightsUsed,
    fired,
    unclearCall: unclear,
    fingerprint: fingerprintOf(args.ruleset.id, args.facts, args.previousTier),
  };
}

export function topReasons(fired: FiredRule[], raise = 3, lower = 2): { up: FiredRule[]; down: FiredRule[] } {
  const up = fired
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points || a.ruleId.localeCompare(b.ruleId))
    .slice(0, raise);
  const down = fired
    .filter((item) => item.points < 0)
    .sort((a, b) => a.points - b.points || a.ruleId.localeCompare(b.ruleId))
    .slice(0, lower);
  return { up, down };
}
