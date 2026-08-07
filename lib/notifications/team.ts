import { sendEmail, type DeliveryResult } from "@/lib/notifications/email";
import type { TeamRole, TeamUser } from "@/types/database";

export type { DeliveryResult };

function roleLabel(role: TeamRole): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export async function deliverTeamInvitation(input: {
  membership: Pick<TeamUser, "email" | "role" | "full_name">;
  inviteUrl: string;
  expiresAt: string;
  invitedByLabel: string | null;
}): Promise<DeliveryResult> {
  const subject = "Your Vistrial team invitation — Divine Acquisition";
  const body = [
    input.membership.full_name
      ? `Hello ${input.membership.full_name},`
      : "Hello,",
    "",
    `${input.invitedByLabel ?? "Someone at Divine Acquisition"} invited you to Vistrial as a ${roleLabel(input.membership.role)}.`,
    "",
    `Accept the invitation (link expires ${new Date(input.expiresAt).toUTCString()}):`,
    input.inviteUrl,
    "",
    "This link works once. If it expires, ask an Owner or Admin to resend it.",
  ].join("\n");

  return sendEmail(input.membership.email, subject, body);
}

export async function deliverTeamPasswordReset(input: {
  email: string;
  resetUrl: string;
  expiresAt: string;
}): Promise<DeliveryResult> {
  const subject = "Reset your Vistrial password";
  const body = [
    "A password reset was requested for your Vistrial team account.",
    "",
    `Use this link before ${new Date(input.expiresAt).toUTCString()}:`,
    input.resetUrl,
    "",
    "The link works once. Using it signs you out of every other session.",
    "If you did not request this, you can ignore the message.",
  ].join("\n");

  return sendEmail(input.email, subject, body);
}
