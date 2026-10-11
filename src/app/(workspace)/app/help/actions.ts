"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { getAuthContext } from "@/lib/auth/session";
import { excerpt, tellRequester } from "@/lib/portal/help";
import { emailStaff } from "@/lib/portal/notices";
import { HELP_TOPICS, isHelpTopic } from "@/lib/portal/requests";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safePath(value: FormDataEntryValue | null): string | null {
  const path = String(value ?? "").trim();
  return path.startsWith("/") && !path.startsWith("//") && path.length <= 300 ? path : null;
}

/** Anyone in the workspace can ask. The team hears by email straight away. */
export async function createHelpRequest(_prev: SettingsSaveResult, formData: FormData): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  const topicValue = formData.get("topic");
  const topic = isHelpTopic(topicValue) ? topicValue : "general";
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { status: "error", error: "Write a message for your team." };
  if (message.length > 4000) return { status: "error", error: "Keep it under 4,000 characters." };
  const lead = String(formData.get("lead_id") ?? "").trim();
  const page = safePath(formData.get("page_path"));

  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("help_request_create", {
    p_org_id: ctx.org.id,
    p_topic: topic,
    p_message: message,
    p_page_path: page,
    p_lead_id: UUID.test(lead) ? lead : null,
  });
  if (error) return { status: "error", error: error.code === "22023" ? error.message : "Could not send it. Try again." };
  const id = data as string;

  await emailStaff({
    orgId: ctx.org.id,
    subject: `${ctx.org.name}: ${HELP_TOPICS[topic]}`,
    lines: [
      `${ctx.member.displayName} asked for help.`,
      excerpt(message),
      page ? `They were on ${page}.` : "",
    ].filter(Boolean),
    href: `/app/team/requests/${id}`,
    ctaLabel: "Reply",
    idempotencyKey: `help-request:${id}`,
  });
  revalidatePath("/app/help");
  redirect(`/app/help/${id}?sent=1`);
}

/** The person who asked, or an owner, adds to the request. It goes back to the team. */
export async function followUpHelpRequest(
  requestId: string,
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!UUID.test(requestId)) return { status: "error", error: "That request was not found." };
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { status: "error", error: "Write a reply." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await db.rpc("help_request_reply", { p_request_id: requestId, p_body: body.slice(0, 4000), p_status: null });
  if (error) return { status: "error", error: error.code === "42501" ? "That request was not found." : "Could not send it." };
  const result = data as { org_id: string; from_team: boolean };

  if (result.from_team) {
    await tellRequester(db, requestId);
  } else {
    await emailStaff({
      orgId: result.org_id,
      subject: `${ctx.org.name}: a reply on a help request`,
      lines: [`${ctx.member.displayName} replied.`, excerpt(body)],
      href: `/app/team/requests/${requestId}`,
      ctaLabel: "Open the request",
      idempotencyKey: `help-followup:${requestId}:${Date.now()}`,
    });
  }
  revalidatePath(`/app/help/${requestId}`);
  revalidatePath(`/app/team/requests/${requestId}`);
  return { status: "saved" };
}

export async function closeHelpRequest(requestId: string): Promise<SettingsSaveResult> {
  if (!UUID.test(requestId)) return { status: "error", error: "That request was not found." };
  const db = (await createClient()) as unknown as SupabaseClient;
  const { error } = await db.rpc("help_request_reply", { p_request_id: requestId, p_body: null, p_status: "closed" });
  if (error) return { status: "error", error: "Could not close it." };
  revalidatePath(`/app/help/${requestId}`);
  revalidatePath("/app/help");
  return { status: "saved" };
}
