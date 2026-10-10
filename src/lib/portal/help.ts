import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { containsContactDetails } from "@/lib/notifications/copy";
import { queuePortalNotice } from "@/lib/portal/notices";

export function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 280 ? `${flat.slice(0, 277)}…` : flat;
}

/** A team reply reaches the person who asked as a notice, by email, following their timing choice. */
export async function tellRequester(db: SupabaseClient, requestId: string, body: string): Promise<void> {
  const { data } = await db
    .from("help_requests")
    .select("org_id, created_by_member_id, topic")
    .eq("id", requestId)
    .maybeSingle();
  const row = data as { org_id: string; created_by_member_id: string | null; topic: string } | null;
  if (!row?.created_by_member_id) return;
  await queuePortalNotice({
    orgId: row.org_id,
    memberId: row.created_by_member_id,
    eventType: "help_reply",
    title: "Your Vistrial team replied",
    body: containsContactDetails(body) ? "Open the request to read the reply." : excerpt(body),
    path: `/app/help/${requestId}`,
    dedupeKey: `help-reply:${requestId}:${Date.now()}`,
  });
}
