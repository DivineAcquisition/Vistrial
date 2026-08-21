import type { Enums } from "@/types/database";
import type { ActiveSequenceItem, FollowUpChannel, FollowUpDraftStatus, PendingFollowUpItem } from "@/lib/follow-up/types";
import { FOLLOW_UP_BRANCHES, FOLLOW_UP_CHANNELS } from "@/lib/follow-up/constants";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

export function parsePendingFollowUpItem(value: unknown): PendingFollowUpItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const leadId = asString(row.leadId);
  const leadName = asString(row.leadName);
  const callId = asString(row.callId);
  const branch = asString(row.branch);
  const channel = asString(row.channel);
  const status = asString(row.status);
  const expiresAt = asString(row.expiresAt);
  const createdAt = asString(row.createdAt);
  if (!id || !leadId || !leadName || !callId || !branch || !channel || !status || !expiresAt || !createdAt) {
    return null;
  }
  if (!(FOLLOW_UP_BRANCHES as readonly string[]).includes(branch)) return null;
  if (!(FOLLOW_UP_CHANNELS as readonly string[]).includes(channel)) return null;
  return {
    id,
    leadId,
    leadName,
    callId,
    branch: branch as PendingFollowUpItem["branch"],
    channel: channel as FollowUpChannel,
    status: status as FollowUpDraftStatus,
    lowConfidence: asBoolean(row.lowConfidence),
    lowConfidenceReason: asString(row.lowConfidenceReason),
    expiresAt,
    createdAt,
    sequencePosition: asNumber(row.sequencePosition) ?? 1,
    sequenceRunId: asString(row.sequenceRunId),
    stale: asBoolean(row.stale),
    failureReason: asString(row.failureReason),
  };
}

export function parsePendingFollowUpItems(value: unknown): PendingFollowUpItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(parsePendingFollowUpItem).filter((item): item is PendingFollowUpItem => item !== null);
}

export function parseActiveSequenceItem(value: unknown): ActiveSequenceItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = asString(row.id);
  const branch = asString(row.branch);
  const status = asString(row.status);
  const startedAt = asString(row.startedAt);
  const maxUntil = asString(row.maxUntil);
  if (!id || !branch || !status || !startedAt || !maxUntil) return null;
  if (!(FOLLOW_UP_BRANCHES as readonly string[]).includes(branch)) return null;
  return {
    id,
    branch: branch as ActiveSequenceItem["branch"],
    status: status as Enums<"follow_up_sequence_status">,
    haltReason: (asString(row.haltReason) as Enums<"follow_up_halt_reason"> | null) ?? null,
    nextPosition: asNumber(row.nextPosition) ?? 1,
    maxSteps: asNumber(row.maxSteps) ?? 1,
    maxUntil,
    startedAt,
  };
}

export function parseActiveSequenceItems(value: unknown): ActiveSequenceItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseActiveSequenceItem).filter((item): item is ActiveSequenceItem => item !== null);
}
