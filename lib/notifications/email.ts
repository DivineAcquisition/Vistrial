/**
 * The one place an email leaves this system.
 *
 * Delivery is never assumed. Every caller records what came back, because a
 * notification that quietly failed is the difference between a charge a client
 * expected and a chargeback.
 *
 * Sends through Resend from the mail subdomain (configurable from-address and
 * reply-to in app_settings). Immediate API accept/reject remains the delivery
 * status source recorded on each notification row.
 */

import {
  emailFromAddress,
  emailReplyToAddress,
} from "@/lib/settings/urls";

export type DeliveryResult = {
  status: "sent" | "failed";
  error: string | null;
};

export async function emailConfigured(): Promise<boolean> {
  const from = await emailFromAddress();
  return Boolean(process.env.RESEND_API_KEY?.trim() && from?.trim());
}

export async function sendEmail(
  recipient: string | null,
  subject: string,
  body: string
): Promise<DeliveryResult> {
  if (recipient === null || recipient.trim() === "") {
    return {
      status: "failed",
      error: "This client has no contact email, so there is nowhere to send it.",
    };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (await emailFromAddress())?.trim();
  const replyTo = (await emailReplyToAddress())?.trim();

  if (!apiKey || !from) {
    return {
      status: "failed",
      error:
        "No delivery channel is configured. Set RESEND_API_KEY and the email from-address in Settings, then send it again.",
    };
  }

  const payload: Record<string, unknown> = {
    from,
    to: [recipient],
    subject,
    text: body,
  };
  if (replyTo) {
    payload.reply_to = replyTo;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (thrown) {
    return {
      status: "failed",
      error: `Could not reach the email provider: ${
        thrown instanceof Error ? thrown.message : String(thrown)
      }`,
    };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      status: "failed",
      error: `The email provider rejected the message (${response.status}): ${
        detail.slice(0, 200) || "no reason given"
      }`,
    };
  }

  return { status: "sent", error: null };
}
