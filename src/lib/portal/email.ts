import "server-only";

import { Resend } from "resend";

import type { GhlDb } from "@/lib/ghl/tokens";
import { appUrl } from "@/lib/app-url";
import { resendConfigured } from "@/lib/notifications/env";
import { previousEqualRange } from "@/lib/portal/range";
import { loadPortalRpcAdmin, nextSendAtFor, scheduledEmailRange } from "@/lib/portal/load";
import { portalPdf } from "@/lib/portal/pdf";
import { buildPortalSummary } from "@/lib/portal/summary";
import { summaryOverstates } from "@/lib/reporting/summary";
import type { ReportingRange } from "@/lib/reporting/range";
import { ghlError, ghlLog } from "@/lib/ghl/log";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function runPortalEmailJobs(db: GhlDb): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = new Date();
  const { data: schedules, error } = await db
    .from("portal_schedules")
    .select("org_id, cadence, enabled, next_send_at")
    .eq("enabled", true)
    .lte("next_send_at", now.toISOString());
  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of schedules ?? []) {
    const cadence = row.cadence === "weekly" ? "weekly" : "monthly";
    try {
      const result = await sendPortalEmailForOrg(db, row.org_id, cadence);
      if (result.status === "sent") sent += 1;
      else skipped += 1;
      await db
        .from("portal_schedules")
        .update({
          last_sent_at: result.status === "sent" ? now.toISOString() : undefined,
          last_error: result.status === "sent" ? null : result.reason,
          next_send_at: nextSendAtFor(cadence, now),
        })
        .eq("org_id", row.org_id);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "portal email failed";
      failed += 1;
      await db
        .from("portal_schedules")
        .update({ last_error: message, next_send_at: nextSendAtFor(cadence, now) })
        .eq("org_id", row.org_id);
      ghlError("portal.email.failed", { orgId: row.org_id, error: message });
    }
  }
  ghlLog("portal.email.ran", { sent, skipped, failed });
  return { sent, skipped, failed };
}

export async function sendPortalEmailForOrg(
  db: GhlDb,
  orgId: string,
  cadence: "weekly" | "monthly"
): Promise<{ status: "sent" } | { status: "skipped"; reason: string }> {
  const cfg = resendConfigured();
  if (!cfg) return { status: "skipped", reason: "RESEND_API_KEY or RESEND_FROM is not set. The email was not faked." };

  const { data: org } = await db
    .from("organizations")
    .select("id, name, slug, activated_at")
    .eq("id", orgId)
    .maybeSingle();
  if (!org?.activated_at) return { status: "skipped", reason: "Workspace is not activated." };

  const { data: members } = await db
    .from("org_members")
    .select("email, role, active")
    .eq("org_id", orgId)
    .eq("active", true)
    .in("role", ["owner", "admin"]);
  const recipients = [...new Set((members ?? []).map((row) => row.email).filter(Boolean))];
  if (recipients.length === 0) return { status: "skipped", reason: "No owner or admin email to send to." };

  const range = scheduledEmailRange(cadence);
  const previous = previousEqualRange(range, org.activated_at);
  const generatedAt = new Date().toISOString();
  const [outcome, coverage, sources, terminal, speed, adoption, ads, processor, calendar, forms, recorder] =
    await Promise.all([
      loadReportingPanelAdmin(db, orgId, "outcome", range),
      loadReportingPanelAdmin(db, orgId, "coverage", range),
      loadReportingPanelAdmin(db, orgId, "sources", range),
      loadReportingPanelAdmin(db, orgId, "terminal", range),
      loadReportingPanelAdmin(db, orgId, "speed", range),
      loadPortalRpcAdmin(orgId, "portal_adoption", range),
      loadPortalRpcAdmin(orgId, "portal_ads", range),
      loadPortalRpcAdmin(orgId, "portal_processor", range),
      loadPortalRpcAdmin(orgId, "portal_calendar", range),
      loadPortalRpcAdmin(orgId, "portal_forms", range),
      loadPortalRpcAdmin(orgId, "portal_recorder", range),
    ]);
  const previousOutcome = previous ? await loadReportingPanelAdmin(db, orgId, "outcome", previous) : null;
  const previousCoverage = previous ? await loadReportingPanelAdmin(db, orgId, "coverage", previous) : null;
  const summary = buildPortalSummary({
    outcome: outcome as never,
    previousOutcome: previousOutcome as never,
    coverage: coverage as never,
    previousCoverage: previousCoverage as never,
    sources: sources as never,
    terminal: terminal as never,
    speed: speed as never,
  });
  if (summaryOverstates(summary)) {
    throw new Error("Scheduled summary overclaimed.");
  }
  const bytes = await portalPdf({
    orgName: org.name,
    orgSlug: org.slug,
    range,
    generatedAt,
    summary,
    outcome,
    coverage,
    terminal,
    sources,
    adoption,
    ads,
    processor,
    calendar,
    forms,
    recorder,
  });

  const href = `${appUrl()}/portal?range=custom&from=${range.fromDate}&to=${range.toDate}`;
  const resend = new Resend(cfg.apiKey);
  const { error } = await resend.emails.send({
    from: cfg.from,
    to: recipients,
    subject: `${org.name} owner report · ${range.fromDate} to ${range.toDate}`,
    text: `${summary}\n\nRange ${range.fromDate} to ${range.toDate}. Generated ${generatedAt}. Workspace ${org.slug}.\n${href}`,
    html: `<p style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.45">${escapeHtml(summary)}</p><p>Range ${escapeHtml(range.fromDate)} to ${escapeHtml(range.toDate)}. Generated ${escapeHtml(generatedAt)}. Workspace ${escapeHtml(org.slug)}.</p><p><a href="${escapeHtml(href)}">Open the owner portal</a></p>`,
    attachments: [
      {
        filename: `vistrial-owner-report-${org.slug}-${range.fromDate}.pdf`,
        content: Buffer.from(bytes),
      },
    ],
  });
  if (error) throw new Error(error.message);
  return { status: "sent" };
}

async function loadReportingPanelAdmin(
  db: GhlDb,
  orgId: string,
  panel: "outcome" | "coverage" | "sources" | "terminal" | "speed",
  range: Pick<ReportingRange, "from" | "to" | "key">
): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("load_reporting_panel", {
    p_org_id: orgId,
    p_panel: panel,
    p_from: range.from,
    p_to: range.to,
    p_range_key: range.key,
  });
  if (error) throw new Error(error.message);
  return asRecord(data);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
