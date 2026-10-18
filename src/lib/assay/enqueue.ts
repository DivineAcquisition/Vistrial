import "server-only";

import { parseAssaySignals } from "@/lib/assay/signals";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type Loose = SupabaseClient;

function db(): Loose {
  return getSupabaseAdmin() as unknown as Loose;
}

export async function noteLeadForAssay(input: {
  orgId: string;
  leadId: string;
  eventKey: string;
  mode?: "live" | "historic" | "rules_change" | "nightly";
}): Promise<void> {
  try {
    const { error } = await db()
      .from("assay_jobs")
      .upsert(
        {
          org_id: input.orgId,
          lead_id: input.leadId,
          mode: input.mode ?? "live",
          event_key: input.eventKey.slice(0, 180),
          status: "pending",
        },
        { onConflict: "org_id,event_key", ignoreDuplicates: true }
      );
    if (error) console.error("[assay] enqueue failed", error.code ?? "error");
  } catch (error) {
    console.error("[assay] enqueue failed", error instanceof Error ? error.message.slice(0, 80) : "error");
  }
}

/** Stores structured signals from the extraction Scribe already ran. No extra model call. */
export async function rememberCallSignals(input: {
  orgId: string;
  leadId: string;
  callId: string;
  raw: unknown;
  occurredAt: string | null;
}): Promise<void> {
  try {
    const ageDays = input.occurredAt ? Math.max(0, (Date.now() - Date.parse(input.occurredAt)) / 86400000) : 0;
    const signals = parseAssaySignals(input.raw, ageDays);
    const { error } = await db().from("assay_call_signals").upsert(
      {
        lead_id: input.leadId,
        org_id: input.orgId,
        call_id: input.callId,
        signals,
        call_at: input.occurredAt,
      },
      { onConflict: "lead_id" }
    );
    if (error) console.error("[assay] signals not stored", error.code ?? "error");
  } catch (error) {
    console.error("[assay] signals not stored", error instanceof Error ? error.message.slice(0, 80) : "error");
  }
}
