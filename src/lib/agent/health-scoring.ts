// ============================================
// HEALTH SCORING ENGINE
// 6-factor client health computation (0-100)
// ============================================

const WEIGHTS = {
  interactionRecency: 0.25,
  sentiment: 0.20,
  deliverableHealth: 0.20,
  billingStatus: 0.15,
  contractTimeline: 0.10,
  engagementSignals: 0.10,
};

export interface HealthFactors {
  interactionRecency: number;
  sentiment: number;
  deliverableHealth: number;
  billingStatus: number;
  contractTimeline: number;
  engagementSignals: number;
}

export interface HealthResult {
  score: number;
  factors: HealthFactors;
  warningLevel: 'none' | 'soft' | 'active' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
}

export function computeHealthScore(factors: HealthFactors): number {
  return Math.round(
    factors.interactionRecency * WEIGHTS.interactionRecency +
    factors.sentiment * WEIGHTS.sentiment +
    factors.deliverableHealth * WEIGHTS.deliverableHealth +
    factors.billingStatus * WEIGHTS.billingStatus +
    factors.contractTimeline * WEIGHTS.contractTimeline +
    factors.engagementSignals * WEIGHTS.engagementSignals
  );
}

export function getWarningLevel(score: number): 'none' | 'soft' | 'active' | 'critical' {
  if (score >= 80) return 'none';
  if (score >= 60) return 'soft';
  if (score >= 40) return 'active';
  return 'critical';
}

export function getTrend(currentScore: number, averageScore: number): 'improving' | 'stable' | 'declining' {
  if (currentScore > averageScore + 5) return 'improving';
  if (currentScore < averageScore - 5) return 'declining';
  return 'stable';
}

export function computeInteractionRecencyScore(daysSince: number): number {
  if (daysSince <= 3) return 100;
  if (daysSince <= 7) return 80;
  if (daysSince <= 14) return 60;
  if (daysSince <= 21) return 35;
  if (daysSince <= 30) return 15;
  return 0;
}

export function computeSentimentScore(sentiment: string | null): number {
  const map: Record<string, number> = {
    enthusiastic: 100, positive: 85, neutral: 60, confused: 40,
    disappointed: 25, frustrated: 15, angry: 0,
  };
  return sentiment ? (map[sentiment] ?? 50) : 50;
}

export function computeDeliverableHealthScore(overdue: number, total: number): number {
  if (total === 0) return 40;
  if (overdue === 0) return 100;
  if (overdue === 1) return 50;
  return 20;
}

export function computeBillingScore(overdueInvoices: number, oldestOverdueDays: number): number {
  if (overdueInvoices === 0) return 100;
  if (oldestOverdueDays <= 7) return 50;
  if (oldestOverdueDays <= 14) return 25;
  return 0;
}

export function computeContractTimelineScore(daysToRenewal: number | null, renewalStatus: string): number {
  if (renewalStatus === 'accepted') return 100;
  if (daysToRenewal === null) return 70;
  if (daysToRenewal > 90) return 100;
  if (daysToRenewal > 60) return 80;
  if (daysToRenewal > 30) return 60;
  if (daysToRenewal > 14) return 30;
  if (daysToRenewal > 0) return 10;
  return 0;
}

export function computeEngagementScore(avgResponseHours: number | null, npsScore: number | null): number {
  let score = 60;
  if (avgResponseHours !== null) {
    if (avgResponseHours <= 24) score = 100;
    else if (avgResponseHours <= 48) score = 80;
    else if (avgResponseHours <= 72) score = 60;
    else if (avgResponseHours <= 168) score = 35;
    else score = 15;
  }
  if (npsScore !== null) {
    if (npsScore >= 9) score = Math.min(100, score + 10);
    else if (npsScore <= 6) score = Math.max(0, score - 20);
  }
  return score;
}

export function computeFullHealth(params: {
  daysSinceInteraction: number;
  lastSentiment: string | null;
  overdueDeliverables: number;
  totalDeliverables: number;
  overdueInvoices: number;
  oldestOverdueDays: number;
  daysToRenewal: number | null;
  renewalStatus: string;
  avgResponseHours: number | null;
  npsScore: number | null;
  previousAvgScore: number;
}): HealthResult {
  const factors: HealthFactors = {
    interactionRecency: computeInteractionRecencyScore(params.daysSinceInteraction),
    sentiment: computeSentimentScore(params.lastSentiment),
    deliverableHealth: computeDeliverableHealthScore(params.overdueDeliverables, params.totalDeliverables),
    billingStatus: computeBillingScore(params.overdueInvoices, params.oldestOverdueDays),
    contractTimeline: computeContractTimelineScore(params.daysToRenewal, params.renewalStatus),
    engagementSignals: computeEngagementScore(params.avgResponseHours, params.npsScore),
  };

  const score = computeHealthScore(factors);
  return {
    score,
    factors,
    warningLevel: getWarningLevel(score),
    trend: getTrend(score, params.previousAvgScore),
  };
}
