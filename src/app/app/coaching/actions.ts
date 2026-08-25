"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function acknowledgeCallCoaching(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_call_coaching", { p_org_id: ctx.org.id });
  if (error) return { ok: false, error: "Could not record that you were told." };
  revalidatePath("/", "layout");
  revalidatePath("/app/coaching");
  return { ok: true };
}

export async function recordBriefView(leadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_brief_view", {
    p_org_id: ctx.org.id,
    p_lead_id: leadId,
  });
  if (error) return { ok: false, error: "Could not record that the brief was opened." };
  return { ok: true };
}
