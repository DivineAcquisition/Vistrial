"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { canRequestData } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { emailStaff } from "@/lib/portal/notices";
import { createClient } from "@/lib/supabase/server";

const KIND_WORDS = { export: "a full copy of its data", deletion: "its data deleted" } as const;

export async function requestData(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canRequestData(ctx)) return { status: "error", error: "Only an owner can ask for this." };
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "export" && kind !== "deletion") return { status: "error", error: "Choose what you need." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (kind === "deletion" && String(formData.get("confirm") ?? "") !== "yes") {
    return { status: "error", error: "Tick the box to confirm you understand what deletion means." };
  }

  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("data_request_create", { p_org_id: ctx.org.id, p_kind: kind, p_note: note || null });
  if (error) return { status: "error", error: "Could not send the request." };
  const result = data as { id: string; already: boolean };
  if (result.already) return { status: "error", error: "You already have one of these open. Your team is on it." };

  await emailStaff({
    orgId: ctx.org.id,
    subject: `${ctx.org.name} asked for ${KIND_WORDS[kind]}`,
    lines: [
      `${ctx.member.displayName} asked for ${ctx.org.name} to have ${KIND_WORDS[kind]}.`,
      note ? `Their note: ${note}` : "They did not add a note.",
      "Nothing happens automatically. Update the request when it is done or if you decline it.",
    ],
    href: "/app/team/data-requests",
    ctaLabel: "Open requests",
    idempotencyKey: `data-request:${result.id}`,
  });
  revalidatePath("/app/settings/privacy");
  return { status: "saved" };
}

export async function cancelDataRequestForm(formData: FormData): Promise<void> {
  await cancelDataRequest(String(formData.get("id") ?? ""));
}

export async function cancelDataRequest(requestId: string): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canRequestData(ctx)) return { status: "error", error: "Only an owner can cancel this." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db.rpc("data_request_act", {
    p_request_id: requestId,
    p_action: "cancel",
    p_note: "Cancelled by the Owner.",
    p_user_id: null,
    p_expected: null,
  });
  if (error) return { status: "error", error: "It can no longer be cancelled." };
  revalidatePath("/app/settings/privacy");
  return { status: "saved" };
}
