import type { ForsightSourceType } from "@/lib/forsight/types";

/**
 * Forsight never answers a broken connection with empty data. An empty
 * dashboard that is really a bad credential or an unreachable base is worse
 * than an error screen, so every failed read throws, and the message names the
 * workspace it failed for.
 */
export class ForsightSourceError extends Error {
  readonly orgId: string;
  readonly sourceType: ForsightSourceType;
  readonly reason: ForsightFailureReason;
  readonly httpStatus: number | null;
  readonly detail: string | null;

  constructor(args: {
    orgId: string;
    orgLabel?: string | null;
    sourceType: ForsightSourceType;
    reason: ForsightFailureReason;
    httpStatus?: number | null;
    detail?: string | null;
  }) {
    super(forsightFailureMessage(args));
    this.name = "ForsightSourceError";
    this.orgId = args.orgId;
    this.sourceType = args.sourceType;
    this.reason = args.reason;
    this.httpStatus = args.httpStatus ?? null;
    this.detail = args.detail ?? null;
  }
}

export type ForsightFailureReason =
  | "not_configured"
  | "credential_missing"
  | "credential_rejected"
  | "unreachable"
  | "rate_limited"
  | "malformed_response";

const REASON_TEXT: Record<ForsightFailureReason, string> = {
  not_configured: "has no Forsight data source",
  credential_missing: "cannot be read because the platform credential is not configured",
  credential_rejected: "rejected the platform credential",
  unreachable: "could not be reached",
  rate_limited: "is rate limiting Forsight",
  malformed_response: "returned something Forsight could not read",
};

const SOURCE_TEXT: Record<ForsightSourceType, string> = {
  airtable: "Airtable base",
  meta_ads: "Meta ad account",
  ghl: "LeadConnector location",
  vistrial_core: "Vistrial workspace data",
};

export function forsightFailureMessage(args: {
  orgId: string;
  orgLabel?: string | null;
  sourceType: ForsightSourceType;
  reason: ForsightFailureReason;
  httpStatus?: number | null;
  detail?: string | null;
}): string {
  const workspace = args.orgLabel?.trim()
    ? `${args.orgLabel.trim()} (${args.orgId})`
    : args.orgId;
  const status = args.httpStatus ? ` HTTP ${args.httpStatus}.` : "";
  const detail = args.detail?.trim() ? ` ${args.detail.trim()}` : "";
  return `Forsight: the ${SOURCE_TEXT[args.sourceType]} for workspace ${workspace} ${REASON_TEXT[args.reason]}.${status}${detail}`;
}
