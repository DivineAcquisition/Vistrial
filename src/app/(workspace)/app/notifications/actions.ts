"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mark the person's own alerts read. Row security refuses anyone else's. */
export async function markNotificationsRead(ids?: string[]): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (ids && ids.length === 0) return { status: "saved" };
  const wanted = (ids ?? []).filter((id) => UUID.test(id)).slice(0, 100);
  if (ids && wanted.length === 0) return { status: "error", error: "Nothing to mark." };
  const db = await createClient();
  const now = new Date().toISOString();
  let query = db
    .from("notifications")
    .update({ status: "acted", acted_at: now, updated_at: now })
    .eq("org_id", ctx.org.id)
    .eq("recipient_user_id", ctx.user.id)
    .is("acted_at", null);
  if (wanted.length) query = query.in("id", wanted);
  const { error } = await query;
  if (error) return { status: "error", error: "Could not mark those as read." };
  revalidatePath("/app/notifications");
  return { status: "saved" };
}
