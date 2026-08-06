/**
 * Ad spend writes. Kept free of the Next.js server-only boundary so the upsert
 * and spread rules can be exercised in tests with the in-memory ledger.
 */

import type { Day } from "@/lib/billing/cycle";
import { daysInPeriod } from "@/lib/portal/cpa";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { AdSpend } from "@/types/database";

export type SpendEntry = {
  clientId: string;
  spendDate: Day;
  amount: number;
  campaignId?: string | null;
  note?: string | null;
  enteredBy: string;
  enteredByLabel: string;
};

/**
 * Upsert one day. Without a campaign the uniqueness is (client, day); with a
 * campaign it is (campaign, day). Re-entering the same day replaces the amount
 * rather than stacking a second row.
 */
export async function upsertAdSpend(db: LedgerDb, entry: SpendEntry): Promise<AdSpend> {
  const campaignId = entry.campaignId ?? null;

  let existing: AdSpend | null = null;

  if (campaignId) {
    const { data, error } = await db
      .from("ad_spend")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("spend_date", entry.spendDate)
      .returns<AdSpend[]>()
      .maybeSingle();
    if (error) throw new Error(error.message);
    existing = data;
  } else {
    const { data, error } = await db
      .from("ad_spend")
      .select("*")
      .eq("client_id", entry.clientId)
      .is("campaign_id", null)
      .eq("spend_date", entry.spendDate)
      .returns<AdSpend[]>()
      .maybeSingle();
    if (error) throw new Error(error.message);
    existing = data;
  }

  if (existing) {
    const { data, error } = await db
      .from("ad_spend")
      .update({
        amount: entry.amount,
        note: entry.note ?? null,
        entered_by: entry.enteredBy,
        entered_by_label: entry.enteredByLabel,
      })
      .eq("id", existing.id)
      .select("*")
      .returns<AdSpend[]>()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await db
    .from("ad_spend")
    .insert({
      client_id: entry.clientId,
      campaign_id: campaignId,
      spend_date: entry.spendDate,
      amount: entry.amount,
      note: entry.note ?? null,
      entered_by: entry.enteredBy,
      entered_by_label: entry.enteredByLabel,
    })
    .select("*")
    .returns<AdSpend[]>()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Spread one total evenly across an inclusive date range, one upsert per day.
 * Remainder cents land on the final day so the sum matches the total exactly.
 */
export async function spreadAdSpend(
  db: LedgerDb,
  input: {
    clientId: string;
    start: Day;
    end: Day;
    total: number;
    campaignId?: string | null;
    note?: string | null;
    enteredBy: string;
    enteredByLabel: string;
  }
): Promise<AdSpend[]> {
  const days = daysInPeriod(input.start, input.end);
  if (days.length === 0) {
    throw new Error("The spend range has no days in it.");
  }

  const cents = Math.round(input.total * 100);
  const perDay = Math.floor(cents / days.length);
  const remainder = cents - perDay * days.length;

  const rows: AdSpend[] = [];
  for (let index = 0; index < days.length; index += 1) {
    const amount = (perDay + (index === days.length - 1 ? remainder : 0)) / 100;
    rows.push(
      await upsertAdSpend(db, {
        clientId: input.clientId,
        spendDate: days[index],
        amount,
        campaignId: input.campaignId,
        note: input.note,
        enteredBy: input.enteredBy,
        enteredByLabel: input.enteredByLabel,
      })
    );
  }
  return rows;
}
