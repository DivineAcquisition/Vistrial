"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canSeePeople } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { loadAttention, type AttentionState } from "@/lib/portal/attention";
import { createClient } from "@/lib/supabase/server";

export async function refreshAttention(): Promise<AttentionState> {
  return loadAttention(await getAuthContext());
}

/** Names for the leads this browser opened last. Row-level security drops any the person cannot see. */
export async function recentLeadNames(ids: string[]): Promise<Array<{ id: string; name: string }>> {
  const ctx = await getAuthContext();
  if (!canSeePeople(ctx)) return [];
  const wanted = [...new Set(ids.filter(isLeadId))].slice(0, 8);
  if (!wanted.length) return [];
  const db = await createClient();
  const { data } = await db
    .from("leads")
    .select("id, first_name, last_name")
    .eq("org_id", ctx.org.id)
    .is("merged_into", null)
    .in("id", wanted);
  const names = new Map(
    (data ?? []).map((row) => [
      row.id,
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Unnamed lead",
    ])
  );
  return wanted.flatMap((id) => (names.has(id) ? [{ id, name: names.get(id) as string }] : []));
}

export async function dismissLiveMessage(): Promise<void> {
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  await db.rpc("onboarding_live_seen", { p_org_id: ctx.org.id });
}
