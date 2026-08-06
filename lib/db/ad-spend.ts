import "server-only";

import type { Day } from "@/lib/billing/cycle";
import { createServiceClient } from "@/lib/supabase/server";
import type { AdSpend, Campaign } from "@/types/database";

export async function listCampaigns(clientId: string): Promise<Campaign[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("campaigns")
    .select("*")
    .eq("client_id", clientId)
    .order("name", { ascending: true })
    .returns<Campaign[]>();

  if (error) throw new Error(`Failed to list campaigns: ${error.message}`);
  return data ?? [];
}

export async function listAdSpend(
  clientId: string,
  period?: { start: Day; end: Day }
): Promise<AdSpend[]> {
  const db = createServiceClient();
  let query = db.from("ad_spend").select("*").eq("client_id", clientId);

  if (period) {
    query = query.gte("spend_date", period.start).lte("spend_date", period.end);
  }

  const { data, error } = await query
    .order("spend_date", { ascending: false })
    .returns<AdSpend[]>();

  if (error) throw new Error(`Failed to list ad spend: ${error.message}`);
  return data ?? [];
}
