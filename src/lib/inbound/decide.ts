import type { InboundHoldReason, WorkspaceStatus } from "@/types/database";

/**
 * Every inbound source (CRM, Stripe, transcripts, forms, Commas, and later
 * Telnyx and Stripe billing) answers one question before it stores anything
 * against a workspace or acts on it: is there exactly one open workspace for
 * this event? Anything else is held, and nothing happens.
 */
export type InboundDecision =
  | { action: "accept"; orgId: string }
  | { action: "hold"; reason: InboundHoldReason; orgId: string | null };

export function decideInbound(args: {
  candidates: ReadonlyArray<{ id: string; status: WorkspaceStatus }>;
  /** A source we cannot verify or act on yet. Always held. */
  sourceEnabled?: boolean;
}): InboundDecision {
  const unique = [...new Map(args.candidates.map((row) => [row.id, row])).values()];
  if (args.sourceEnabled === false) {
    return { action: "hold", reason: "source_not_enabled", orgId: unique.length === 1 ? unique[0].id : null };
  }
  if (unique.length === 0) return { action: "hold", reason: "unmatched", orgId: null };
  if (unique.length > 1) return { action: "hold", reason: "ambiguous", orgId: null };
  const [only] = unique;
  if (only.status === "paused") return { action: "hold", reason: "workspace_paused", orgId: only.id };
  if (only.status === "closed") return { action: "hold", reason: "workspace_closed", orgId: only.id };
  return { action: "accept", orgId: only.id };
}

/** Holds keep the event for review, bounded so a hostile sender cannot fill the table. */
export const MAX_HELD_PAYLOAD_BYTES = 64 * 1024;

export function boundedPayload(payload: unknown): unknown {
  let text: string;
  try {
    text = JSON.stringify(payload ?? {});
  } catch {
    return { unserializable: true };
  }
  if (text.length <= MAX_HELD_PAYLOAD_BYTES) return payload ?? {};
  return { truncated: true, bytes: text.length, head: text.slice(0, MAX_HELD_PAYLOAD_BYTES) };
}
