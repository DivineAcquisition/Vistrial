import { MIN_SAMPLE_PER_GROUP } from "@/lib/sales-os/stats";

import { scoreLead, tierForScore } from "@/lib/assay/score";
import type { PartWeights, Ruleset, ScoringFacts, ScoreRule, Tier } from "@/lib/assay/types";

export const LEARN_MIN_CLOSED = 40;
export const LEARN_WINDOW_DAYS = 180;
export const LEARN_MIN_WON = 10;
export const LEARN_MIN_LOST = 10;
export const MAX_POINT_MOVE = 0.5;
export const MIN_WEIGHT = 10;
export const MAX_WEIGHT = 60;

export type ClosedExample = {
  facts: ScoringFacts;
  won: boolean;
};

export type RuleChange = {
  ruleId: string;
  from: number;
  to: number;
  explanation: string;
  enough: boolean;
};

export type Proposal = {
  available: boolean;
  reason: string;
  changes: RuleChange[];
  weights: PartWeights;
  weightNotes: string[];
  backtest: {
    current: Record<Tier, { won: number; n: number; rate: number | null }>;
    proposed: Record<Tier, { won: number; n: number; rate: number | null }>;
  } | null;
};

function emptyTiers(): Record<Tier, { won: number; n: number; rate: number | null }> {
  return {
    hot: { won: 0, n: 0, rate: null },
    warm: { won: 0, n: 0, rate: null },
    cool: { won: 0, n: 0, rate: null },
    cold: { won: 0, n: 0, rate: null },
  };
}

function fillRates(bucket: Record<Tier, { won: number; n: number; rate: number | null }>) {
  for (const tier of Object.keys(bucket) as Tier[]) {
    const row = bucket[tier];
    row.rate = row.n >= MIN_SAMPLE_PER_GROUP && row.n > 0 ? Math.round((row.won / row.n) * 1000) / 10 : null;
  }
}

function clampMove(templatePoints: number, proposed: number): number {
  if (templatePoints === 0) return 0;
  const low = templatePoints * (1 - MAX_POINT_MOVE);
  const high = templatePoints * (1 + MAX_POINT_MOVE);
  const min = Math.min(low, high);
  const max = Math.max(low, high);
  return Math.round(Math.min(max, Math.max(min, proposed)));
}

function clampWeights(weights: PartWeights): PartWeights {
  const next = { ...weights };
  (Object.keys(next) as Array<keyof PartWeights>).forEach((key) => {
    next[key] = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(next[key])));
  });
  let guard = 0;
  while (next.fit + next.engagement + next.call !== 100 && guard < 20) {
    const sum = next.fit + next.engagement + next.call;
    const key = (["engagement", "fit", "call"] as const).find((part) => (sum > 100 ? next[part] > MIN_WEIGHT : next[part] < MAX_WEIGHT));
    if (!key) break;
    next[key] += sum > 100 ? -1 : 1;
    guard += 1;
  }
  return next;
}

function ruleFires(rule: ScoreRule, facts: ScoringFacts, ruleset: Ruleset): boolean {
  const scored = scoreLead({ facts, ruleset: { ...ruleset, rules: [{ ...rule, enabled: true }] }, previousTier: null });
  return scored.fired.some((item) => item.ruleId === rule.id);
}

export function learningAvailable(examples: ClosedExample[]): { ok: boolean; reason: string } {
  const won = examples.filter((row) => row.won).length;
  const lost = examples.length - won;
  if (examples.length < LEARN_MIN_CLOSED || won < LEARN_MIN_WON || lost < LEARN_MIN_LOST) {
    return { ok: false, reason: "Using industry defaults. Learning starts after 40 closed deals." };
  }
  return { ok: true, reason: "Enough closed deals to review a proposal." };
}

export function proposeAdjustment(args: {
  ruleset: Ruleset;
  template: Ruleset;
  examples: ClosedExample[];
}): Proposal {
  const gate = learningAvailable(args.examples);
  if (!gate.ok) {
    return { available: false, reason: gate.reason, changes: [], weights: args.ruleset.weights, weightNotes: [], backtest: null };
  }
  const won = args.examples.filter((row) => row.won).length;
  const overall = won / args.examples.length;
  const changes: RuleChange[] = [];
  const partLift: Record<"fit" | "engagement" | "call", number[]> = { fit: [], engagement: [], call: [] };
  for (const rule of args.ruleset.rules) {
    const templateRule = args.template.rules.find((item) => item.id === rule.id);
    const baseline = templateRule?.points ?? rule.points;
    const hit = args.examples.filter((row) => ruleFires(rule, row.facts, args.ruleset));
    if (hit.length < MIN_SAMPLE_PER_GROUP) {
      changes.push({
        ruleId: rule.id,
        from: rule.points,
        to: rule.points,
        enough: false,
        explanation: `${rule.name} is left alone. Not enough data.`,
      });
      continue;
    }
    const hitWon = hit.filter((row) => row.won).length / hit.length;
    const ratio = overall > 0 ? hitWon / overall : 1;
    let next = rule.points;
    if (ratio >= 1.5 && rule.points !== 0) next = rule.points + Math.abs(rule.points) * 0.4;
    else if (ratio <= 0.67 && rule.points !== 0) next = rule.points - Math.abs(rule.points) * 0.4;
    next = clampMove(baseline, next);
    if (next !== rule.points) {
      partLift[rule.part].push(ratio);
      changes.push({
        ruleId: rule.id,
        from: rule.points,
        to: next,
        enough: true,
        explanation: `${rule.name} showed a win rate ${ratio.toFixed(1)} times the average. Suggest changing points from ${rule.points > 0 ? "+" : ""}${rule.points} to ${next > 0 ? "+" : ""}${next}.`,
      });
    }
  }
  const weights = { ...args.ruleset.weights };
  const weightNotes: string[] = [];
  (["fit", "engagement", "call"] as const).forEach((part) => {
    const lifts = partLift[part];
    if (!lifts.length) return;
    const avg = lifts.reduce((sum, value) => sum + value, 0) / lifts.length;
    const delta = avg >= 1.5 ? 5 : avg <= 0.67 ? -5 : 0;
    if (!delta) return;
    weights[part] += delta;
    weightNotes.push(`${part} weight moves by ${delta} because its rules tracked wins differently from their points.`);
  });
  const clamped = clampWeights(weights);
  const proposedRules = args.ruleset.rules.map((rule) => {
    const change = changes.find((item) => item.ruleId === rule.id && item.enough && item.to !== item.from);
    return change ? { ...rule, points: change.to } : rule;
  });
  const proposed: Ruleset = { ...args.ruleset, id: `${args.ruleset.id}:proposal`, rules: proposedRules, weights: clamped };
  const currentBucket = emptyTiers();
  const proposedBucket = emptyTiers();
  for (const example of args.examples) {
    const current = scoreLead({ facts: example.facts, ruleset: args.ruleset, previousTier: null });
    const next = scoreLead({ facts: example.facts, ruleset: proposed, previousTier: null });
    const currentTier = tierForScore(current.score, args.ruleset.tiers);
    const nextTier = tierForScore(next.score, proposed.tiers);
    currentBucket[currentTier].n += 1;
    proposedBucket[nextTier].n += 1;
    if (example.won) {
      currentBucket[currentTier].won += 1;
      proposedBucket[nextTier].won += 1;
    }
  }
  fillRates(currentBucket);
  fillRates(proposedBucket);
  return {
    available: true,
    reason: "Review this proposal. Nothing changes until you publish it.",
    changes,
    weights: clamped,
    weightNotes,
    backtest: { current: currentBucket, proposed: proposedBucket },
  };
}

export function tiersSeparate(hot: { won: number; n: number }, warm: { won: number; n: number }): { enough: boolean; flag: boolean } {
  if (hot.n < MIN_SAMPLE_PER_GROUP || warm.n < MIN_SAMPLE_PER_GROUP) return { enough: false, flag: false };
  const hotRate = hot.won / hot.n;
  const warmRate = warm.won / warm.n;
  return { enough: true, flag: hotRate <= warmRate };
}
