import "server-only";

import { Resend } from "resend";

import { appUrl } from "@/lib/app-url";
import { transactionalEmailHtml } from "@/lib/email/layout";
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

export function portalEmailHtml(args: { heading: string; lines: string[]; cta?: { label: string; href: string } }): string {
  return transactionalEmailHtml({
    heading: args.heading,
    preheader: args.lines[0],
    lines: args.lines,
    cta: args.cta,
  });
}

export async function sendPortalMail(args: {
  to: string | string[];
  subject: string;
  heading?: string;
  lines: string[];
  cta?: { label: string; href: string };
  idempotencyKey: string;
}): Promise<MailResult> {
  const cfg = resendConfigured();
  if (!cfg) return { ok: false, error: "Email is not set up yet (RESEND_API_KEY or RESEND_FROM is missing)." };
  const to = (Array.isArray(args.to) ? args.to : [args.to]).filter((address) => address.includes("@"));
  if (to.length === 0) return { ok: false, error: "No address to send to." };
  const cta = args.cta ? { label: args.cta.label, href: absoluteUrl(args.cta.href) } : undefined;
  try {
    const { data, error } = await new Resend(cfg.apiKey).emails.send(
      {
        from: cfg.from,
        to,
        subject: args.subject,
        html: portalEmailHtml({ heading: args.heading ?? args.subject, lines: args.lines, cta }),
        text: [...args.lines, cta ? `${cta.label}: ${cta.href}` : ""].filter(Boolean).join("\n\n"),
      },
      { idempotencyKey: args.idempotencyKey.slice(0, 256) }
    );
    if (error) return { ok: false, error: error.message };
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
  const result = await sendPortalMail({
    to,
    subject: args.subject,
    lines: args.lines,
    cta: { label: args.ctaLabel, href: args.href },
    idempotencyKey: args.idempotencyKey,
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
