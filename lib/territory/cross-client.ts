/**
 * Cross-client duplicate flags.
 *
 * Same phone or email on leads for two different clients within the window.
 * Never blocks either lead — both belong to the client whose campaign produced
 * them. The flag exists so an administrator sees it before (or after) both
 * produce confirmed appointments.
 */

import { orderedPair } from "@/lib/territory/conflict";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Lead } from "@/types/database";

export const DEFAULT_CROSS_CLIENT_WINDOW_DAYS = 90;

export async function getCrossClientWindowDays(db: LedgerDb): Promise<number> {
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "cross_client_window_days")
    .maybeSingle();

  const parsed = Number(data?.value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return DEFAULT_CROSS_CLIENT_WINDOW_DAYS;
  }
  return parsed;
}

/**
 * After a new lead is created, flag any matches at other clients. Safe to call
 * more than once — the unique pair index absorbs duplicates.
 */
export async function flagCrossClientMatches(
  db: LedgerDb,
  lead: Pick<Lead, "id" | "client_id" | "phone_key" | "email_key" | "arrived_at">
): Promise<number> {
  const windowDays = await getCrossClientWindowDays(db);
  const since = new Date(
    Date.parse(lead.arrived_at) - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  let flagged = 0;

  const check = async (
    column: "phone_key" | "email_key",
    value: string | null,
    matchOn: "phone" | "email"
  ) => {
    if (value === null || value === "") return;

    const { data, error } = await db
      .from("leads")
      .select("id, client_id")
      .eq(column, value)
      .neq("client_id", lead.client_id)
      .gte("arrived_at", since)
      .returns<{ id: string; client_id: string }[]>();

    if (error) throw new Error(error.message);

    for (const other of data ?? []) {
      const [leadA, leadB] = orderedPair(lead.id, other.id);
      const [clientA, clientB] =
        leadA === lead.id
          ? [lead.client_id, other.client_id]
          : [other.client_id, lead.client_id];

      const { error: insertError } = await db.from("cross_client_matches").insert({
        lead_a_id: leadA,
        lead_b_id: leadB,
        client_a_id: clientA,
        client_b_id: clientB,
        match_on: matchOn,
        match_key: value,
      });

      // Unique violation = already flagged.
      if (insertError && insertError.code !== "23505") {
        throw new Error(insertError.message);
      }
      if (!insertError) flagged += 1;
    }
  };

  await check("phone_key", lead.phone_key, "phone");
  await check("email_key", lead.email_key, "email");

  return flagged;
}
