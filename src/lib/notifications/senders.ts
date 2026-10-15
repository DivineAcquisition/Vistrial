import { Resend } from "resend";
import webpush from "web-push";

import { categoryForEvent } from "@/lib/email/category";
import type { EmailCategory, FooterVars } from "@/lib/email/footer";
import { lifecycleFromSeparated, renderFooter, sendingStream, staffRecipientAllowed } from "@/lib/email/footer";
import { emailLogoUrl, transactionalEmailHtml } from "@/lib/email/layout";
import {
  activeStaffEmails,
  issueUnsubscribeUrl,
  lifecycleSuppressed,
  recordEmailSend,
  withPreferences,
} from "@/lib/email/send-guard";
import { decryptSecret } from "@/lib/ghl/crypto";
import type { GhlDb } from "@/lib/ghl/tokens";
import { assertLockScreenSafe } from "@/lib/notifications/copy";
import { resendConfigured, twilioConfigured, vapidConfigured } from "@/lib/notifications/env";
import { hrefWithNotification } from "@/lib/notifications/messages";
import type { NotificationChannel } from "@/lib/notifications/types";

export type SendResult =
  | { ok: true; providerId?: string }
  | { ok: false; error: string; retry: boolean };

function emailHtml(args: {
  title: string;
  body: string;
  href: string;
  items?: Array<{ text: string; href: string }>;
  footerHtml: string;
}): string {
  const lines = args.body && args.body !== args.title ? [args.body] : [];
  return transactionalEmailHtml({
    heading: args.title,
    preheader: args.body || args.title,
    lines,
    items: args.items,
    cta: { label: "Open in Vistrial", href: args.href },
    footerHtml: args.footerHtml,
    logoUrl: emailLogoUrl(),
  });
}

export async function sendEmail(args: {
  to: string;
  title: string;
  body: string;
  href: string;
  notificationId: string;
  eventType: string;
  items?: Array<{ text: string; href: string }>;
  category?: EmailCategory;
  footer?: FooterVars;
}): Promise<SendResult> {
  assertLockScreenSafe(args.title, args.body);
  const category = args.category ?? categoryForEvent(args.eventType);
  if (!category) return { ok: false, error: "This email has no category, so it was not sent.", retry: false };
  const cfg = resendConfigured();
  if (!cfg) return { ok: false, error: "RESEND_API_KEY or RESEND_FROM is not set.", retry: false };

  if (category === "I") {
    const staff = await activeStaffEmails();
    if (!staffRecipientAllowed(args.to, staff)) {
      return { ok: false, error: "Internal email was not sent. The recipient is not staff.", retry: false };
    }
  }

  const stream = sendingStream(category);
  if (stream === "lifecycle") {
    if (!lifecycleFromSeparated(cfg.from, cfg.lifecycleFrom)) {
      return { ok: false, error: "Lifecycle email needs its own sending host (RESEND_FROM_LIFECYCLE).", retry: false };
    }
    if (await lifecycleSuppressed(args.to)) {
      return { ok: false, error: "This address is unsubscribed from lifecycle email.", retry: false };
    }
  }

  const footerVars = withPreferences({ recipientEmail: args.to, ...args.footer });
  if ((category === "E" || category === "F") && !footerVars.unsubscribeUrl) {
    footerVars.unsubscribeUrl = (await issueUnsubscribeUrl(args.to, category)) ?? undefined;
  }
  const rendered = renderFooter({ category, vars: footerVars });
  if (!rendered.ok) return { ok: false, error: rendered.error, retry: false };

  const from = stream === "lifecycle" ? cfg.lifecycleFrom! : cfg.from;
  const headers: Record<string, string> = {};
  if (footerVars.unsubscribeUrl && (category === "E" || category === "F")) {
    headers["List-Unsubscribe"] = `<${footerVars.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const resend = new Resend(cfg.apiKey);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [args.to],
      subject: args.title,
      html: emailHtml({ ...args, footerHtml: rendered.footer.html }),
      text: `${args.body}\n${args.href}\n\n${rendered.footer.text}`,
      headers,
      tags: [
        { name: "category", value: category },
        { name: "footer_version", value: rendered.footer.version },
      ],
    },
    { idempotencyKey: `${args.eventType}/${args.notificationId}` }
  );
  if (error) return { ok: false, error: error.message, retry: true };
  await recordEmailSend({
    category,
    version: rendered.footer.version,
    recipient: args.to,
    stream,
    providerId: data?.id,
  });
  return { ok: true, providerId: data?.id };
}

export async function sendPush(args: {
  db: GhlDb;
  userId: string;
  title: string;
  body: string;
  href: string;
  notificationId: string;
}): Promise<SendResult> {
  assertLockScreenSafe(args.title, args.body);
  const cfg = vapidConfigured();
  if (!cfg) return { ok: false, error: "VAPID keys are not set.", retry: false };

  const { data: subs } = await args.db
    .from("notification_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", args.userId);
  if (!subs || subs.length === 0) {
    return { ok: false, error: "No push subscription for this user.", retry: false };
  }

  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  const payload = JSON.stringify({
    title: args.title,
    body: args.body,
    href: hrefWithNotification(args.href, args.notificationId),
    nid: args.notificationId,
  });

  let sent = 0;
  let lastError = "";
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      lastError = error instanceof Error ? error.message : "Push failed.";
      if (status === 404 || status === 410) {
        await args.db.from("notification_push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }
  if (sent === 0) return { ok: false, error: lastError || "Push delivery failed.", retry: true };
  return { ok: true };
}

export async function sendSms(args: {
  to: string;
  title: string;
  body: string;
}): Promise<SendResult> {
  assertLockScreenSafe(args.title, args.body);
  const cfg = twilioConfigured();
  if (!cfg) return { ok: false, error: "Twilio is not configured.", retry: false };
  if (!args.to) return { ok: false, error: "No phone number on this profile.", retry: false };

  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: args.to,
        From: cfg.from,
        Body: `${args.title}. ${args.body}`,
      }),
    }
  );
  const json = (await response.json()) as { sid?: string; message?: string };
  if (!response.ok) {
    return { ok: false, error: json.message || `Twilio ${response.status}`, retry: response.status >= 500 };
  }
  return { ok: true, providerId: json.sid };
}

export async function sendTeam(args: {
  db: GhlDb;
  orgId: string;
  title: string;
  body: string;
  href: string;
}): Promise<SendResult> {
  assertLockScreenSafe(args.title, args.body);
  const { data: row } = await args.db
    .from("notification_team_channels")
    .select("slack_webhook_encrypted, teams_webhook_encrypted")
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!row?.slack_webhook_encrypted && !row?.teams_webhook_encrypted) {
    return { ok: false, error: "No Slack or Teams webhook is configured.", retry: false };
  }

  const text = `${args.title}\n${args.body}\n${args.href}`;
  const urls: string[] = [];
  try {
    if (row.slack_webhook_encrypted) urls.push(decryptSecret(row.slack_webhook_encrypted));
    if (row.teams_webhook_encrypted) urls.push(decryptSecret(row.teams_webhook_encrypted));
  } catch {
    return { ok: false, error: "Could not decrypt the team webhook.", retry: false };
  }

  let sent = 0;
  let lastError = "";
  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) sent += 1;
    else lastError = `Webhook ${response.status}`;
  }
  if (sent === 0) return { ok: false, error: lastError || "Team webhook failed.", retry: true };
  return { ok: true };
}

export async function sendOnChannel(
  channel: NotificationChannel,
  args: {
    db: GhlDb;
    orgId: string | null;
    userId: string | null;
    email: string | null;
    phone: string | null;
    title: string;
    body: string;
    href: string;
    notificationId: string;
    eventType: string;
    items?: Array<{ text: string; href: string }>;
    footer?: FooterVars;
    category?: EmailCategory;
  }
): Promise<SendResult> {
  switch (channel) {
    case "email":
      if (!args.email) return { ok: false, error: "No email on this member.", retry: false };
      return sendEmail({
        to: args.email,
        title: args.title,
        body: args.body,
        href: args.href,
        notificationId: args.notificationId,
        eventType: args.eventType,
        category: args.category,
        footer: { recipientEmail: args.email, referenceId: args.notificationId, ...args.footer },
        items: args.items?.map((item) => ({
          text: item.text,
          href: hrefWithNotification(item.href, args.notificationId),
        })),
      });
    case "push":
      if (!args.userId) return { ok: false, error: "No recipient for push.", retry: false };
      return sendPush({
        db: args.db,
        userId: args.userId,
        title: args.title,
        body: args.body,
        href: args.href,
        notificationId: args.notificationId,
      });
    case "sms":
      if (!args.phone) return { ok: false, error: "No phone number on this profile.", retry: false };
      return sendSms({ to: args.phone, title: args.title, body: args.body });
    case "team":
      if (!args.orgId) return { ok: false, error: "Team channel needs an organization.", retry: false };
      return sendTeam({
        db: args.db,
        orgId: args.orgId,
        title: args.title,
        body: args.body,
        href: args.href,
      });
    case "da_console":
      return { ok: true };
    default:
      return { ok: false, error: "Unknown channel.", retry: false };
  }
}
