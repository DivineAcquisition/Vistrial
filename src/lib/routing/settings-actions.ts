"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { canSeePeople } from "@/lib/auth/portal-access";
import { previewRouting } from "@/lib/routing/assign";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

function client(): Promise<SupabaseClient> {
  return createClient().then((value) => value as unknown as SupabaseClient);
}

export async function saveRoutingSettings(input: {
  mode: string;
  stickyDays: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!canSeePeople(ctx) && !ctx.isStaff) return { ok: false, error: "You cannot change routing." };
  const sticky = Number.isFinite(input.stickyDays) ? Math.max(0, Math.min(365, Math.round(input.stickyDays))) : 30;
  const db = await client();
  const snapshot = { mode: input.mode, sticky_days: sticky };
  const { error } = await db.from("routing_settings").upsert({
    org_id: ctx.org.id,
    mode: input.mode,
    sticky_days: sticky,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Could not save routing." };
  await db.from("routing_revisions").insert({ org_id: ctx.org.id, snapshot, note: "Routing settings saved" });
  revalidatePath("/app/settings/routing");
  return { ok: true };
}

export async function setMyAvailability(away: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  const db = await client();
  const { error } = await db.from("operator_availability").upsert({
    org_id: ctx.org.id,
    member_id: ctx.member.id,
    away,
    away_until: null,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Could not update availability." };
  return { ok: true };
}

export async function previewRoute(input: {
  source: string;
  service: string;
}): Promise<{ ok: true; explanation: string; next: string[] } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!canSeePeople(ctx) && !ctx.isStaff) return { ok: false, error: "You cannot preview routing." };
  const db = await createClient();
  const result = await previewRouting(db, ctx.org.id, {
    source: input.source.trim() || null,
    service: input.service.trim() || null,
  });
  return { ok: true, explanation: result.explanation, next: result.next };
}
