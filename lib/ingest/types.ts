import type { InboundEventStatus } from "@/types/database";

export type { LedgerDb } from "@/lib/supabase/ledger";

/** What handling one recognised event produced, recorded on the stored event. */
export type ProcessOutcome = {
  status: Extract<InboundEventStatus, "processed" | "failed">;
  leadId?: string | null;
  touchId?: string | null;
  appointmentId?: string | null;
  error?: string | null;
};

export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === UNIQUE_VIOLATION;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
