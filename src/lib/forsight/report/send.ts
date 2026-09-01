import "server-only";

import { Resend } from "resend";

import { appUrl } from "@/lib/app-url";
import { forsightLog } from "@/lib/forsight/report/log";
import { forsightReportPdf } from "@/lib/forsight/report/pdf";
import { periodPath } from "@/lib/forsight/report/load";
import type { StoredReport } from "@/lib/forsight/report/types";
import type { ForsightDb } from "@/lib/forsight/sources";
import { resendConfigured } from "@/lib/notifications/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Client contacts for a workspace.
 *
 * Vistrial does not store a contacts list per workspace. The people who
 * receive a report are the active owner and admin members, using the email
 * on `org_members`. Portal-only owners are included: they are still the
 * client. Invites that have not been accepted are not emailed.
 */

export async function clientReportRecipients(
  db: ForsightDb,
  orgId: string
): Promise<string[]> {
  const { data } = await db
    .from("org_members")
    .select("email, role, active")
    .eq("org_id", orgId)
    .eq("active", true)
    .in("role", ["owner", "admin"]);
  return [...new Set((data ?? []).map((row) => row.email.trim().toLowerCase()).filter(Boolean))];
}

export async function sendStoredReport(args: {
  db: ForsightDb;
  stored: StoredReport;
  sentBy: { memberId: string | null; email: string | null };
}): Promise<{ status: "sent"; recipients: string[] } | { status: "failed"; reason: string }> {
  const cfg = resendConfigured();
  if (!cfg) {
    return {
      status: "failed",
      reason: "RESEND_API_KEY or RESEND_FROM is not set. The email was not faked.",
    };
  }

  const recipients = await clientReportRecipients(args.db, args.stored.orgId);
  if (recipients.length === 0) {
    return { status: "failed", reason: "No owner or admin email to send to." };
  }

  const bytes = await forsightReportPdf(args.stored);
  const report = args.stored.report;
  const href = `${appUrl()}/app/forsight/reports/${periodPath(report.period.start)}`;
  const filename = `forsight-${periodPath(report.period.start)}-v${args.stored.version}.pdf`;

  const resend = new Resend(cfg.apiKey);
  const { data, error } = await resend.emails.send({
    from: cfg.from,
    to: recipients,
    subject: `${report.workspace.name} · ${report.period.label} report`,
    text: [
      `${report.workspace.name} — ${report.period.label}.`,
      `Generated ${report.generatedAt}. Version ${args.stored.version}.`,
      `This is a snapshot. The numbers in it will not move.`,
      href,
    ].join("\n"),
    html: `<p>${escapeHtml(report.workspace.name)} — ${escapeHtml(report.period.label)}.</p><p>Generated ${escapeHtml(report.generatedAt)}. Version ${args.stored.version}.</p><p>This is a snapshot. The numbers in it will not move.</p><p><a href="${escapeHtml(href)}">Open in Forsight</a></p>`,
    attachments: [{ filename, content: Buffer.from(bytes) }],
  });

  const admin = getSupabaseAdmin();
  const { error: logError } = await admin.from("forsight_report_sends").insert({
    report_id: args.stored.id,
    org_id: args.stored.orgId,
    version: args.stored.version,
    sent_by_member_id: args.sentBy.memberId,
    sent_by_email: args.sentBy.email,
    recipients,
    provider_id: data?.id ?? null,
    error: error?.message ?? null,
  });

  if (logError) {
    return { status: "failed", reason: `Sent, but the send could not be logged: ${logError.message}` };
  }

  if (error) {
    forsightLog("forsight.report.send_failed", {
      orgId: args.stored.orgId,
      version: args.stored.version,
      reason: error.message,
      recipients,
    });
    return { status: "failed", reason: error.message };
  }

  forsightLog("forsight.report.sent", {
    orgId: args.stored.orgId,
    version: args.stored.version,
    sentBy: args.sentBy.email,
    recipients,
  });

  return { status: "sent", recipients };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
