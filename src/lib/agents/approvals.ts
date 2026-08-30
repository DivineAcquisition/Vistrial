import {
  AGENT_EXTERNAL_BATCH_CAP_DEFAULT,
  AGENT_INTERNAL_BATCH_CAP_DEFAULT,
  AGENT_UNDO_WINDOW_MS,
} from "@/lib/agents/constants";
import { isRawPayloadPreview, type PlainLanguagePreview } from "@/lib/agents/preview";
import type { AgentTier } from "@/lib/agents/types";

export type ApprovalDecision = "pending" | "approved" | "rejected" | "undone";

export function approvalRequired(tier: AgentTier, observationMode: boolean): boolean {
  if (observationMode && (tier === "write_internal" || tier === "write_external" || tier === "contact")) {
    return true;
  }
  return tier === "write_internal" || tier === "write_external" || tier === "contact";
}

export function observationBlocksExecution(
  observationMode: boolean,
  tier: AgentTier,
): boolean {
  return observationMode && (tier === "write_internal" || tier === "write_external" || tier === "contact");
}

export function canApproveExternalWrite(args: {
  preview: PlainLanguagePreview;
  namedHumanId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  if (!args.namedHumanId) return { ok: false, reason: "A named person has to approve this." };
  if (isRawPayloadPreview(args.preview.before) || isRawPayloadPreview(args.preview.after)) {
    return { ok: false, reason: "The preview has to be plain language, not a payload." };
  }
  return { ok: true };
}

export function batchWriteCap(external: boolean): number {
  return external ? AGENT_EXTERNAL_BATCH_CAP_DEFAULT : AGENT_INTERNAL_BATCH_CAP_DEFAULT;
}

export function undoExpiresAt(approvedAt: Date): Date {
  return new Date(approvedAt.getTime() + AGENT_UNDO_WINDOW_MS);
}

export function canUndo(args: {
  reversible: boolean;
  approvedAt: Date;
  now?: Date;
}): boolean {
  if (!args.reversible) return false;
  return (args.now ?? new Date()).getTime() <= undoExpiresAt(args.approvedAt).getTime();
}
