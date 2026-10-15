import "server-only";

import { buildInviteLink } from "@/lib/auth/invites";
import { sendPortalMail } from "@/lib/portal/notices";

/** The Owner invitation email: simple, from Vistrial, saying what to expect. */
export async function sendOwnerInvite(args: { to: string; orgName: string; token: string; key: string }) {
  return sendPortalMail({
    to: args.to,
    subject: `Your Vistrial workspace for ${args.orgName} is ready`,
    heading: "Welcome to Vistrial",
    lines: [
      `Your Vistrial team has set up a workspace for ${args.orgName}.`,
      "Use the button below to set your password. Then a short guided setup walks you through connecting your CRM, choosing who approves messages, and testing everything with a practice lead.",
      "It takes about 45 minutes of your time, spread over a few days. Nothing is sent to your leads until you say you are ready.",
      "The link works for 7 days and only for this email address.",
    ],
    cta: { label: "Set up my account", href: buildInviteLink(args.token) },
    idempotencyKey: args.key,
    category: "A",
    footer: { recipientEmail: args.to },
  });
}
