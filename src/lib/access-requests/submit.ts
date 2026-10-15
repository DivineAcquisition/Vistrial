import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AccessSubmission } from "@/lib/access-requests/validate";
import { submissionPayload } from "@/lib/access-requests/validate";
import { renderRequestEmail } from "@/lib/access-requests/email-template";
import { EMAIL_DEFAULTS } from "@/lib/marketing/content";
import { FORMS } from "@/lib/marketing/content";
import { sendPortalMail } from "@/lib/portal/notices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Db = SupabaseClient;

function db(): Db {
  return getSupabaseAdmin() as unknown as Db;
}

export type SaveResult = { ok: true } | { ok: false; message: string };

export function visitorMessage(code: string | null): string {
  if (code === "rate") return FORMS.errors.rate;
  return FORMS.errors.generic;
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = (await response.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

export async function savePublicRequest(value: AccessSubmission, ip: string): Promise<SaveResult> {
  let data: { ok?: boolean; code?: string } | null = null;
  try {
    const result = await db().rpc("submit_access_request", {
      p_payload: submissionPayload(value),
      p_ip: ip.slice(0, 80),
    });
    if (result.error) return { ok: false, message: FORMS.errors.generic };
    data = result.data as { ok?: boolean; code?: string } | null;
  } catch {
    return { ok: false, message: FORMS.errors.generic };
  }
  if (!data?.ok) return { ok: false, message: visitorMessage(data?.code ?? null) };
  if (value.honeypot) return { ok: true };
  await db().rpc("record_public_site_event", { p_type: "form_complete", p_path: value.pagePath });
  await sendRequestConfirmation(value.email, value.fullName, value.kind);
  await notifyStaffOfRequests();
  return { ok: true };
}

async function templateFor(kind: AccessSubmission["kind"]): Promise<{ subject: string; body: string }> {
  const id = kind === "custom" ? "custom_confirm" : "access_confirm";
  const fallback = kind === "custom" ? EMAIL_DEFAULTS.customConfirm : EMAIL_DEFAULTS.accessConfirm;
  const { data } = await db().from("access_request_templates").select("subject, body").eq("id", id).maybeSingle();
  return {
    subject: data?.subject || fallback.subject,
    body: data?.body || fallback.body,
  };
}

export async function sendRequestConfirmation(email: string, name: string, kind: AccessSubmission["kind"]): Promise<void> {
  const template = await templateFor(kind);
  const body = renderRequestEmail(template.body, name);
  const subject = renderRequestEmail(template.subject, name);
  if (!body || !subject) return;
  const { data: row } = await db().from("access_requests").select("id").eq("email", email).maybeSingle();
  const id = row?.id as string | undefined;
  const mail = await sendPortalMail({
    to: email,
    subject,
    lines: body.split("\n").filter((line) => line.length > 0),
    idempotencyKey: `access-confirm:${id ?? email}:${Date.now()}`,
    category: "D",
    footer: { recipientEmail: email, siteName: "vistrial.io" },
  });
  if (id) {
    await db().rpc("mark_access_request_confirmation", {
      p_id: id,
      p_status: mail.ok ? "sent" : "failed",
    });
  }
}

async function platformAdminEmails(): Promise<string[]> {
  const { data } = await db().from("platform_staff").select("email").eq("active", true).eq("role", "platform_admin");
  return [...new Set((data ?? []).map((row) => String(row.email)).filter((email) => email.includes("@")))];
}

export async function notifyStaffOfRequests(): Promise<void> {
  const { data: claimed } = await db().rpc("claim_access_request_staff_notice");
  if (claimed !== true) return;
  const to = await platformAdminEmails();
  if (!to.length) return;
  await sendPortalMail({
    to,
    subject: "New access requests are waiting",
    lines: ["New access requests are waiting in the queue.", "Open the client roster and choose Access requests."],
    cta: { label: "Open the queue", href: "/app/team/roster/requests" },
    idempotencyKey: `access-notice:${new Date().toISOString().slice(0, 13)}`,
    category: "I",
    footer: { recipientEmail: to[0], workspaceName: "Vistrial" },
  });
}

export async function notifyStaffOfAbuse(): Promise<void> {
  const { data: claimed } = await db().rpc("claim_access_request_abuse_notice");
  if (claimed !== true) return;
  const to = await platformAdminEmails();
  if (!to.length) return;
  await sendPortalMail({
    to,
    subject: "Access request volume is high",
    lines: ["A lot of access requests were blocked in a short time. Check the queue before treating the new rows as real."],
    idempotencyKey: `access-abuse:${new Date().toISOString().slice(0, 13)}`,
    category: "I",
    footer: { recipientEmail: to[0], workspaceName: "Vistrial" },
  });
}

export async function retryAccessRequestEmail(): Promise<number> {
  const { data, error } = await db().rpc("access_request_confirmation_batch", { p_limit: 20 });
  if (error || !Array.isArray(data)) return 0;
  let sent = 0;
  for (const row of data as Array<{ id: string; email: string; full_name: string; kind: string }>) {
    const kind = row.kind === "custom" ? "custom" : "private_access";
    await sendRequestConfirmation(row.email, row.full_name, kind);
    sent += 1;
  }
  return sent;
}

export async function notifyStaleRequests(): Promise<void> {
  const { data: count } = await db().rpc("access_request_stale_count");
  if (typeof count !== "number" || count < 1) return;
  const { data: claimed } = await db().rpc("claim_access_request_stale_notice");
  if (claimed !== true) return;
  const to = await platformAdminEmails();
  if (!to.length) return;
  await sendPortalMail({
    to,
    subject: "Access requests have been waiting",
    lines: [`${count} access requests have been waiting past the reminder.`],
    idempotencyKey: `access-stale:${new Date().toISOString().slice(0, 10)}`,
    category: "I",
    footer: { recipientEmail: to[0], workspaceName: "Vistrial" },
  });
}
