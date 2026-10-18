import type { ScoreRule } from "@/lib/assay/types";

/**
 * Fields Assay is allowed to read. Location is service fit only.
 * Zip code by itself, names, and protected attributes are not inputs.
 */
export const APPROVED_FACT_KEYS = [
  "serviceMatch",
  "serviceHighValue",
  "dealValueFit",
  "insideServiceArea",
  "travelWithinLimit",
  "sourceQuality",
  "contactComplete",
  "decisionMakerKnown",
  "requestedQuote",
  "booked",
  "rescheduledByLead",
  "canceled",
  "noShow",
  "completedMeeting",
  "replyMinutes",
  "replyHourOnly",
  "twoWayCount14d",
  "openedQuote",
  "openedMaterials",
  "reopened",
  "stageMove",
  "inboundIntent",
  "paidDeposit",
  "applicationSubmitted",
  "programMatch",
  "leadSilenceDays",
  "timeline",
  "budgetFit",
  "decisionOnCall",
  "objectionResolved",
  "buyingIntent",
  "nextStep",
  "redFlag",
] as const;

const FORBIDDEN = [
  "name",
  "first_name",
  "last_name",
  "firstname",
  "lastname",
  "gender",
  "sex",
  "age",
  "race",
  "ethnicity",
  "religion",
  "language",
  "disability",
  "disabled",
  "zip",
  "zipcode",
  "zip_code",
  "postal",
  "postal_code",
  "income",
  "salary",
  "wealth",
  "health",
  "diagnosis",
  "neighborhood",
  "demographic",
  "family",
  "children",
  "marital",
];

const FORBIDDEN_SET = new Set(FORBIDDEN);

export function isForbiddenKey(key: string): boolean {
  const normalized = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (FORBIDDEN_SET.has(normalized)) return true;
  return FORBIDDEN.some((word) => normalized === word || normalized.startsWith(`${word}_`) || normalized.endsWith(`_${word}`) || normalized.includes(`_${word}_`));
}

export function isApprovedFactKey(key: string): boolean {
  if (isForbiddenKey(key)) return false;
  if ((APPROVED_FACT_KEYS as readonly string[]).includes(key)) return true;
  return /^custom_[a-z0-9_]{1,40}$/.test(key) && !isForbiddenKey(key.slice("custom_".length));
}

export function assertRulesFair(rules: ScoreRule[]): void {
  for (const rule of rules) {
    if (!isApprovedFactKey(rule.when.key)) {
      throw new Error(`Scoring cannot use "${rule.when.key}".`);
    }
    if (isForbiddenKey(rule.id) || isForbiddenKey(rule.name)) {
      throw new Error("A scoring rule cannot be named for a protected attribute.");
    }
  }
}
