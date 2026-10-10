"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import { containsContactDetails } from "@/lib/notifications/copy";
import { excerpt, tellRequester } from "@/lib/portal/help";
import { queuePortalNotice } from "@/lib/portal/notices";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HELP_STATUS = new Set(["in_progress", "answered", "closed"]);
const DATA_STATUS = new Set(["received", "in_progress", "completed", "declined"]);

async function staffDb(): Promise<SupabaseClient | SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { status: "error", error: "Only the Vistrial team can do that." };
  return (await createClient()) as unknown as SupabaseClient;
}

/** Reply as the team. The person who asked gets an email, on their chosen timing. */
export async function replyToHelpRequest(
  requestId: string,
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  if (!UUID.test(requestId)) return { status: "error", error: "That request was not found." };
  const db = await staffDb();
  if ("status" in db) return db;
  const body = String(formData.get("body") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  if (!body && !HELP_STATUS.has(status)) return { status: "error", error: "Write a reply, or choose a status." };
  const { error } = await db.rpc("help_request_reply", {
    p_request_id: requestId,
    p_body: body ? body.slice(0, 4000) : null,
    p_status: HELP_STATUS.has(status) ? status : null,
  });
  if (error) return { status: "error", error: error.code === "42501" ? "That request was not found." : "Could not save the reply." };
  if (body) await tellRequester(db, requestId, body);
  revalidatePath(`/app/team/requests/${requestId}`);
  revalidatePath("/app/team/requests");
  revalidatePath(`/app/help/${requestId}`);
  return { status: "saved" };
}

const DATA_WORDS = { export: "a copy of your data", deletion: "your data deleted" } as const;
const DATA_DONE = {
  completed: "is done",
  declined: "was declined",
  in_progress: "is being worked on",
  received: "is with your team",
} as const;

/** Move a data request along. Nothing is exported or deleted from here. */
export async function updateDataRequest(
  requestId: string,
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  if (!UUID.test(requestId)) return { status: "error", error: "That request was not found." };
  const db = await staffDb();
  if ("status" in db) return db;
  const status = String(formData.get("status") ?? "");
  if (!DATA_STATUS.has(status)) return { status: "error", error: "Choose a status." };
  const note = String(formData.get("team_note") ?? "").trim().slice(0, 2000);
  const { error } = await db.rpc("data_request_update", {
    p_request_id: requestId,
    p_status: status,
    p_team_note: note || null,
  });
  if (error) return { status: "error", error: "Could not update that request." };

  const { data } = await db
    .from("data_requests")
    .select("org_id, kind, requested_by_user_id")
    .eq("id", requestId)
    .maybeSingle();
  const row = data as { org_id: string; kind: "export" | "deletion"; requested_by_user_id: string } | null;
  if (row) {
    const { data: member } = await db
      .from("org_members")
      .select("id")
      .eq("org_id", row.org_id)
      .eq("user_id", row.requested_by_user_id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    const memberId = (member as { id: string } | null)?.id;
    if (memberId) {
      const words = DATA_WORDS[row.kind] ?? "your request";
      const done = DATA_DONE[status as keyof typeof DATA_DONE];
      await queuePortalNotice({
        orgId: row.org_id,
        memberId,
        eventType: "data_request",
        title: `Your request for ${words} ${done}`,
        body: note && !containsContactDetails(note) ? excerpt(note) : "Open Privacy to see the latest.",
        path: "/app/settings/privacy",
        dedupeKey: `data-request:${requestId}:${status}:${note.slice(0, 40)}`,
      });
    }
  }
  revalidatePath("/app/team/requests");
  revalidatePath("/app/settings/privacy");
  return { status: "saved" };
}
