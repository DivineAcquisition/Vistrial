import "server-only";

import { Resend } from "resend";

import { appUrl } from "@/lib/app-url";
import type { EmailCategory, FooterVars } from "@/lib/email/footer";
import { lifecycleFromSeparated, renderFooter, sendingStream, staffRecipientAllowed, unresolvedCopy } from "@/lib/email/footer";
import { emailLogoSrc, transactionalEmailHtml } from "@/lib/email/layout";
import { emailLogoAttachment } from "@/lib/email/logo-file";
import {
  activeStaffEmails,
  issueUnsubscribeUrl,
  lifecycleSuppressed,
  platformAdminEmails,
  recordEmailSend,
  withPreferences,
} from "@/lib/email/send-guard";
import { localDate, zonedStartOfDay } from "@/lib/home/periods";
import type { GhlDb } from "@/lib/ghl/tokens";
import { ghlError } from "@/lib/ghl/log";
import { appendToBatch, enqueueNotification } from "@/lib/notifications/enqueue";
import { resendConfigured } from "@/lib/notifications/env";
import type { NotificationEventType } from "@/lib/notifications/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Email the portal sends. Two kinds:
 *
 * - Notices to a person in a workspace (a reply to their request, an export
 *   ready, a payment problem). These go through the notifications queue, so
 *   they also appear on the person's notifications page and respect their
 *   instant-or-daily choice.
 * - Mail to someone without a seat yet (an invite) or to the Vistrial team.
 *   These are sent straight away through Resend.
 *
 * Neither ever carries lead messages or anything a lead wrote.
 */

export type MailResult = { ok: true; id?: string } | { ok: false; error: string };

export function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${appUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function portalEmailHtml(args: {
  heading: string;
  lines: string[];
  cta?: { label: string; href: string };
  footerHtml?: string;
}): string {
  return transactionalEmailHtml({
    heading: args.heading,
    preheader: args.lines[0],
    lines: args.lines,
    cta: args.cta,
    footerHtml: args.footerHtml,
    logoUrl: emailLogoSrc(),
  });
}

async function alertFooterBlocked(reason: string): Promise<void> {
  ghlError("email.footer.blocked", { error: reason });
  const emails = await platformAdminEmails();
  if (emails.length === 0 || !emails[0]) return;
  await sendPortalMail({
    to: emails,
    subject: "An email was not sent",
    lines: [reason],
    category: "I",
    footer: { workspaceName: "Vistrial", recipientEmail: emails[0] },
    idempotencyKey: `footer-blocked:${reason.slice(0, 120)}`,
    skipBlockAlert: true,
  });
}

export async function sendPortalMail(args: {
  to: string | string[];
  subject: string;
  heading?: string;
  lines: string[];
  cta?: { label: string; href: string };
  idempotencyKey: string;
  category: EmailCategory;
  footer: FooterVars;
  skipBlockAlert?: boolean;
}): Promise<MailResult> {
  const cfg = resendConfigured();
  if (!cfg) return { ok: false, error: "Email is not set up yet (RESEND_API_KEY or RESEND_FROM is missing)." };
  if (unresolvedCopy([args.subject, ...args.lines].join("\n"))) {
    const reason = "Email was not sent. The message still has an unresolved placeholder.";
    if (!args.skipBlockAlert) await alertFooterBlocked(reason);
    return { ok: false, error: reason };
  }
  let to = (Array.isArray(args.to) ? args.to : [args.to]).filter((address) => address.includes("@"));
  if (to.length === 0) return { ok: false, error: "No address to send to." };

  if (args.category === "I") {
    const staff = await activeStaffEmails();
    const blocked = to.filter((address) => !staffRecipientAllowed(address, staff));
    to = to.filter((address) => staffRecipientAllowed(address, staff));
    if (blocked.length > 0 && !args.skipBlockAlert) {
      await alertFooterBlocked(`Internal email was not sent to a non-staff address: ${blocked.join(", ")}`);
    }
    if (to.length === 0) return { ok: false, error: "Internal email was not sent. The recipient is not staff." };
  }

  const stream = sendingStream(args.category);
  if (stream === "lifecycle") {
    if (!lifecycleFromSeparated(cfg.from, cfg.lifecycleFrom)) {
      return { ok: false, error: "Lifecycle email needs its own sending host (RESEND_FROM_LIFECYCLE)." };
    }
    const kept: string[] = [];
    for (const address of to) {
      if (await lifecycleSuppressed(address)) continue;
      kept.push(address);
    }
    if (kept.length === 0) return { ok: false, error: "This address is unsubscribed from lifecycle email." };
    to = kept;
  }

  const footerVars = withPreferences({ ...args.footer });
  if ((args.category === "E" || args.category === "F") && !footerVars.unsubscribeUrl && to[0]) {
    footerVars.unsubscribeUrl = (await issueUnsubscribeUrl(to[0], args.category)) ?? undefined;
  }
  const rendered = renderFooter({ category: args.category, vars: footerVars });
  if (!rendered.ok) {
    if (!args.skipBlockAlert) await alertFooterBlocked(rendered.error);
    return { ok: false, error: rendered.error };
  }

  const from = stream === "lifecycle" ? cfg.lifecycleFrom! : cfg.from;
  const cta = args.cta ? { label: args.cta.label, href: absoluteUrl(args.cta.href) } : undefined;
  const headers: Record<string, string> = {};
  if (footerVars.unsubscribeUrl && (args.category === "E" || args.category === "F")) {
    headers["List-Unsubscribe"] = `<${footerVars.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  try {
    const { data, error } = await new Resend(cfg.apiKey).emails.send(
      {
        from,
        to,
        subject: args.subject,
        html: portalEmailHtml({
          heading: args.heading ?? args.subject,
          lines: args.lines,
          cta,
          footerHtml: rendered.footer.html,
        }),
        text: [...args.lines, cta ? `${cta.label}: ${cta.href}` : "", rendered.footer.text].filter(Boolean).join("\n\n"),
        headers,
        attachments: [emailLogoAttachment()],
        tags: [{ name: "category", value: args.category }, { name: "footer_version", value: rendered.footer.version }],
      },
      { idempotencyKey: args.idempotencyKey.slice(0, 256) }
    );
    if (error) return { ok: false, error: error.message };
    for (const address of to) {
      await recordEmailSend({
        category: args.category,
        version: rendered.footer.version,
        recipient: address,
        stream,
        providerId: data?.id,
      });
    }
    return { ok: true, id: data?.id };
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : "Email failed." };
  }
}

/**
 * The Vistrial people to tell about a workspace: Service Team assigned to it,
 * or every active Platform Admin when nobody is assigned.
 */
export async function staffAddressesFor(orgId: string): Promise<string[]> {
  const db = getSupabaseAdmin();
  const { data: assigned } = await db
    .from("workspace_assignments")
    .select("user_id")
    .eq("org_id", orgId)
    .is("ended_at", null);
  const ids = [...new Set((assigned ?? []).map((row) => row.user_id))];
  const query = db.from("platform_staff").select("email, role, user_id").eq("active", true);
  const { data: staff } = ids.length ? await query.in("user_id", ids) : await query.eq("role", "platform_admin");
  const emails = (staff ?? []).map((row) => row.email).filter((email): email is string => Boolean(email?.includes("@")));
  if (emails.length || !ids.length) return [...new Set(emails)];
  const { data: admins } = await db.from("platform_staff").select("email").eq("active", true).eq("role", "platform_admin");
  return [...new Set((admins ?? []).map((row) => row.email).filter(Boolean))];
}

export async function emailStaff(args: {
  orgId: string;
  subject: string;
  lines: string[];
  href: string;
  ctaLabel: string;
  idempotencyKey: string;
}): Promise<MailResult> {
  const to = await staffAddressesFor(args.orgId);
  if (to.length === 0 || !to[0]) return { ok: false, error: "No staff address to send to." };
  const { data: org } = await getSupabaseAdmin().from("organizations").select("name").eq("id", args.orgId).maybeSingle();
  const result = await sendPortalMail({
    to,
    subject: args.subject,
    lines: args.lines,
    cta: { label: args.ctaLabel, href: args.href },
    idempotencyKey: args.idempotencyKey,
    category: "I",
    footer: {
      recipientEmail: to[0],
      workspaceName: org?.name || "Vistrial",
    },
  });
  if (!result.ok) ghlError("portal.staff_email.failed", { orgId: args.orgId, error: result.error });
  return result;
}

const DIGEST_HOUR = 8;

/** 8am tomorrow, or later today if it is still before 8, in the person's time zone. */
export function nextDigestAt(timeZone: string, now = new Date()): Date {
  const [year, month, day] = localDate(now, timeZone).split("-").map(Number) as [number, number, number];
  const todayStart = zonedStartOfDay(timeZone, year, month, day);
  const today8 = new Date(todayStart.getTime() + DIGEST_HOUR * 3_600_000);
  if (now.getTime() < today8.getTime()) return today8;
  const tomorrow = zonedStartOfDay(timeZone, year, month, day + 1);
  return new Date(tomorrow.getTime() + DIGEST_HOUR * 3_600_000);
}

/**
 * A notice for one person in a workspace, by email. People who chose a daily
 * summary get one email the next morning that lists how many came in.
 */
export async function queuePortalNotice(args: {
  db?: GhlDb;
  orgId: string;
  memberId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  path: string;
  dedupeKey: string;
  subjectIds?: string[];
  actorUserId?: string | null;
}): Promise<string | null> {
  const db = (args.db ?? getSupabaseAdmin()) as GhlDb;
  const { data: member } = await db
    .from("org_members")
    .select("id, user_id, active, notification_delivery, timezone, organizations ( timezone )")
    .eq("id", args.memberId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!member?.active) return null;

  const row = member as unknown as {
    id: string;
    user_id: string;
    notification_delivery?: string | null;
    timezone: string | null;
    organizations: { timezone: string } | Array<{ timezone: string }> | null;
  };
  const orgZone = Array.isArray(row.organizations) ? row.organizations[0]?.timezone : row.organizations?.timezone;
  const zone = row.timezone || orgZone || "UTC";

  if (row.notification_delivery === "digest") {
    const sendAt = nextDigestAt(zone);
    const batchKey = `portal-digest:${row.id}:${sendAt.toISOString().slice(0, 10)}`;
    const subjectId = args.dedupeKey;
    const forCount = (count: number) => ({
      title: count === 1 ? args.title : `${count} updates from Vistrial`,
      body: count === 1 ? args.body : "Open your notifications in Vistrial to see each one.",
    });
    const appended = await appendToBatch(db, {
      orgId: args.orgId,
      batchKey,
      subjectId,
      title: args.title,
      body: args.body,
      forCount,
    });
    if (appended) return null;
    return enqueueNotification(db, {
      orgId: args.orgId,
      eventType: args.eventType,
      channel: "email",
      recipientUserId: row.user_id,
      recipientMemberId: row.id,
      actorUserId: args.actorUserId ?? null,
      subjectIds: [subjectId],
      title: args.title,
      body: args.body,
      href: absoluteUrl("/app/notifications"),
      dedupeKey: batchKey,
      batchKey,
      sendAfter: sendAt,
    });
  }

  return enqueueNotification(db, {
    orgId: args.orgId,
    eventType: args.eventType,
    channel: "email",
    recipientUserId: row.user_id,
    recipientMemberId: row.id,
    actorUserId: args.actorUserId ?? null,
    subjectIds: args.subjectIds ?? [],
    title: args.title,
    body: args.body,
    href: absoluteUrl(args.path),
    dedupeKey: args.dedupeKey,
  });
}
