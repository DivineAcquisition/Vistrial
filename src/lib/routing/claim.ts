"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function claimLead(leadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("claim_unassigned_lead", { p_org_id: ctx.org.id, p_lead_id: leadId });
  if (error) return { ok: false, error: "Could not claim that lead." };
  if (data !== true) return { ok: false, error: "Someone else claimed this lead." };
  revalidatePath("/app/today");
  revalidatePath("/app/queue");
  return { ok: true };
}
