import "server-only";

import { Resend } from "resend";

import { roleLabel } from "@/lib/auth/permissions";
import type { OrgRole } from "@/types/database";
import { appUrl } from "@/lib/app-url";
import { renderFooter } from "@/lib/email/footer";
import { transactionalEmailHtml } from "@/lib/email/layout";
import { recordEmailSend, withPreferences } from "@/lib/email/send-guard";
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

  const lines = [
    `${report.workspace.name}. ${report.period.label}.`,
    `Generated ${report.generatedAt}. Version ${args.stored.version}.`,
    "This is a snapshot. The numbers in it will not move.",
  ];
  const resend = new Resend(cfg.apiKey);
  const { data: members } = await args.db
    .from("org_members")
    .select("email, role")
    .eq("org_id", args.stored.orgId)
    .eq("active", true)
    .in("role", ["owner", "admin"]);
  let data: { id?: string } | null = null;
  let error: { message: string } | null = null;
  let sentCount = 0;
  for (const member of members ?? []) {
    const address = member.email?.trim().toLowerCase();
    if (!address || !recipients.includes(address)) continue;
    const rendered = renderFooter({
      category: "C",
      vars: withPreferences({
        recipientEmail: address,
        role: roleLabel(member.role as OrgRole),
        workspaceName: report.workspace.name,
      }),
    });
    if (!rendered.ok) return { status: "failed", reason: rendered.error };
    const sent = await resend.emails.send({
      from: cfg.from,
      to: [address],
      subject: `${report.workspace.name}, ${report.period.label} report`,
      text: [...lines, href, rendered.footer.text].join("\n"),
      html: transactionalEmailHtml({
        heading: `${report.workspace.name} report`,
        preheader: lines[0],
        lines,
        cta: { label: "Open in Forsight", href },
        footerHtml: rendered.footer.html,
      }),
      tags: [
        { name: "category", value: "C" },
        { name: "footer_version", value: rendered.footer.version },
      ],
      attachments: [{ filename, content: Buffer.from(bytes) }],
    });
    data = sent.data;
    error = sent.error;
    if (error) break;
    sentCount += 1;
    await recordEmailSend({
      category: "C",
      version: rendered.footer.version,
      recipient: address,
      stream: "transactional",
      providerId: sent.data?.id,
    });
  }
  if (!error && sentCount === 0) {
    return { status: "failed", reason: "No owner or admin email could be sent with a footer." };
  }

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
