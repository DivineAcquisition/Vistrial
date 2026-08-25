import { calendarDaysBetween } from "@/lib/scoring/timezone";
import { decideGhostAction } from "@/lib/scoring/ghost";
import { computeReadinessScore, type ScoreWeights } from "@/lib/scoring/compute";
import type { FactorValues } from "@/lib/scoring/compute";
import type { Enums } from "@/types/database";

export type ScoringPreviewConfig = ScoreWeights & {
  readyThreshold: number;
  speedToLeadMinutes: number;
  ghostDaysSoft: number;
  ghostDaysHard: number;
};

export type ScoringPreviewLead = {
  id: string;
  name: string;
  currentScore: number | null;
  leadType: "ready_track" | "nurture_track" | null;
  isHoldout: boolean;
  firstHumanTouchAt: string | null;
  lastTouchAt: string | null;
  optedInAt: string;
  nextActionDueAt: string | null;
  ghostApproachingAt: string | null;
  status: string;
  factors: FactorValues;
};

export type ScoringPreviewMover = {
  id: string;
  name: string;
  fromTrack: string;
  toTrack: string;
  fromPosition: number | null;
  toPosition: number | null;
};

export type ScoringPreviewResult = {
  fingerprint: string;
  trackChanged: number;
  positionChanged: number;
  readyCount: number;
  nurtureCount: number;
  movers: ScoringPreviewMover[];
};

function trackOf(args: {
  isHoldout: boolean;
  score: number | null;
  threshold: number;
}): "ready_track" | "nurture_track" {
  if (args.isHoldout) return "ready_track";
  if (args.score !== null && args.score >= args.threshold) return "ready_track";
  return "nurture_track";
}

function proposedScore(lead: ScoringPreviewLead, weights: ScoreWeights): number | null {
  const computed = computeReadinessScore(lead.factors, weights);
  if (computed.kind === "unscored") return null;
  return computed.total;
}

function approachingGhost(
  lead: ScoringPreviewLead,
  config: ScoringPreviewConfig,
  now: Date,
  timeZone: string
): boolean {
  const last = new Date(lead.lastTouchAt ?? lead.optedInAt);
  const daysSilent = calendarDaysBetween(last, now, timeZone);
  const decision = decideGhostAction({
    status: lead.status as Enums<"lead_status">,
    daysSilent,
    softDays: config.ghostDaysSoft,
    hardDays: config.ghostDaysHard,
    approachingAt: lead.ghostApproachingAt,
  });
  if (decision === "ghost" || decision === "flag") return true;
  if (decision === "clear") return false;
  return Boolean(lead.ghostApproachingAt);
}

function rank(args: {
  leadType: "ready_track" | "nurture_track" | null;
  firstHumanTouchAt: string | null;
  nextActionDueAt: string | null;
  approachingGhost: boolean;
  now: Date;
}): number | null {
  if (!args.firstHumanTouchAt && (args.leadType === "ready_track" || args.leadType === null)) {
    return 1;
  }
  if (args.nextActionDueAt && Date.parse(args.nextActionDueAt) < args.now.getTime()) {
    return 2;
  }
  if (args.leadType === "ready_track") return 3;
  if (args.leadType === "nurture_track") return 4;
  if (args.approachingGhost) return 5;
  return null;
}

function sortScore(args: {
  leadType: "ready_track" | "nurture_track" | null;
  urgencyRank: number | null;
  score: number | null;
}): number {
  if (
    (args.leadType === "ready_track" || args.leadType === "nurture_track") &&
    args.urgencyRank !== 1 &&
    args.urgencyRank !== 2
  ) {
    return args.score ?? -1;
  }
  return 0;
}

function orderKey(args: {
  urgencyRank: number | null;
  sortScore: number;
  lastTouchAt: string | null;
  id: string;
}): string {
  const rank = args.urgencyRank ?? 99;
  const touch = args.lastTouchAt ?? "";
  return `${String(rank).padStart(2, "0")}|${String(100000 - args.sortScore).padStart(6, "0")}|${touch}|${args.id}`;
}

function positions(
  leads: ScoringPreviewLead[],
  config: ScoringPreviewConfig,
  now: Date,
  proposed: boolean,
  timeZone: string
): Map<string, { position: number; track: string; score: number | null }> {
  const rows = leads.map((lead) => {
    const score = proposed ? proposedScore(lead, config) : lead.currentScore;
    const track = proposed
      ? trackOf({ isHoldout: lead.isHoldout, score, threshold: config.readyThreshold })
      : (lead.leadType ?? trackOf({ isHoldout: lead.isHoldout, score, threshold: config.readyThreshold }));
    const ghost = proposed
      ? approachingGhost(lead, config, now, timeZone)
      : Boolean(lead.ghostApproachingAt);
    const urgencyRank = rank({
      leadType: track,
      firstHumanTouchAt: lead.firstHumanTouchAt,
      nextActionDueAt: lead.nextActionDueAt,
      approachingGhost: ghost,
      now,
    });
    return {
      id: lead.id,
      name: lead.name,
      track,
      score,
      key: orderKey({
        urgencyRank,
        sortScore: sortScore({ leadType: track, urgencyRank, score }),
        lastTouchAt: lead.lastTouchAt,
        id: lead.id,
      }),
    };
  });
  rows.sort((a, b) => a.key.localeCompare(b.key));
  const map = new Map<string, { position: number; track: string; score: number | null }>();
  rows.forEach((row, index) => {
    map.set(row.id, { position: index + 1, track: row.track, score: row.score });
  });
  return map;
}

export function scoringPreviewFingerprint(config: ScoringPreviewConfig): string {
  return [
    config.timeline,
    config.investment_capacity,
    config.decision_authority,
    config.pain_severity,
    config.readyThreshold,
    config.speedToLeadMinutes,
    config.ghostDaysSoft,
    config.ghostDaysHard,
  ].join(":");
}

/**
 * Consequence of a scoring-config change against current leads. Does not write
 * score rows. Queue order matches the product ranking (urgency then score).
 */
export function previewScoringImpact(args: {
  leads: ScoringPreviewLead[];
  current: ScoringPreviewConfig;
  proposed: ScoringPreviewConfig;
  now?: Date;
  timeZone?: string;
}): ScoringPreviewResult {
  const now = args.now ?? new Date();
  const timeZone = args.timeZone ?? "UTC";
  const currentPos = positions(args.leads, args.current, now, false, timeZone);
  const nextPos = positions(args.leads, args.proposed, now, true, timeZone);
  const movers: ScoringPreviewMover[] = [];
  let trackChanged = 0;
  let positionChanged = 0;
  let readyCount = 0;
  let nurtureCount = 0;

  for (const lead of args.leads) {
    const from = currentPos.get(lead.id);
    const to = nextPos.get(lead.id);
    if (!from || !to) continue;
    if (to.track === "ready_track") readyCount += 1;
    else nurtureCount += 1;
    const trackMoved = from.track !== to.track;
    const posMoved = from.position !== to.position;
    if (trackMoved) trackChanged += 1;
    if (posMoved) positionChanged += 1;
    if (trackMoved || posMoved) {
      movers.push({
        id: lead.id,
        name: lead.name,
        fromTrack: from.track,
        toTrack: to.track,
        fromPosition: from.position,
        toPosition: to.position,
      });
    }
  }

  movers.sort((a, b) => {
    const aDelta = Math.abs((a.toPosition ?? 0) - (a.fromPosition ?? 0));
    const bDelta = Math.abs((b.toPosition ?? 0) - (b.fromPosition ?? 0));
    if (aDelta !== bDelta) return bDelta - aDelta;
    return a.name.localeCompare(b.name);
  });

  return {
    fingerprint: scoringPreviewFingerprint(args.proposed),
    trackChanged,
    positionChanged,
    readyCount,
    nurtureCount,
    movers: movers.slice(0, 10),
  };
}
