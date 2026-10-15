import { PRODUCTION_APP_ORIGIN } from "@/lib/constants";
import { renderFooter } from "@/lib/email/footer";
import { EMAIL_LOGO_PATH, transactionalEmailHtml } from "@/lib/email/layout";

/**
 * Supabase Auth mail. The same card as product email, with Go template
 * fields left in place for Auth to fill in (`{{ .ConfirmationURL }}` and
 * the rest). Hosted projects read these through the Management API; local
 * `supabase start` reads the HTML files named in config.toml.
 */

const LOGO_URL = `${PRODUCTION_APP_ORIGIN}${EMAIL_LOGO_PATH}`;
const HOME_HREF = "{{ .SiteURL }}";

export type AuthEmailTemplate = {
  /** config.toml key under auth.email.template or auth.email.notification */
  id: string;
  kind: "template" | "notification";
  subject: string;
  filename: string;
  html: string;
  subjectKey: string;
  contentKey: string;
  enabledKey?: string;
};

function card(args: {
  heading: string;
  lines: string[];
  cta?: { label: string; href: string };
  code?: string;
  footnote?: string;
}): string {
  const footer = renderFooter({
    category: "A",
    vars: { recipientEmail: "{{ .Email }}" },
  });
  if (!footer.ok) throw new Error(footer.error);
  return transactionalEmailHtml({
    ...args,
    preheader: args.lines[0],
    logoUrl: LOGO_URL,
    homeHref: HOME_HREF,
    footerHtml: footer.footer.html,
  });
}

const CONFIRM = "{{ .ConfirmationURL }}";

export const AUTH_EMAIL_TEMPLATES: AuthEmailTemplate[] = [
  {
    id: "magic_link",
    kind: "template",
    subject: "Your Vistrial sign-in link",
    filename: "magic_link.html",
    subjectKey: "mailer_subjects_magic_link",
    contentKey: "mailer_templates_magic_link_content",
    html: card({
      heading: "Sign in to Vistrial",
      lines: ["Use the button below to sign in. This link expires shortly and works once."],
      cta: { label: "Sign in", href: CONFIRM },
      footnote: "If you didn't request this, you can ignore this email.",
    }),
  },
  {
    id: "confirmation",
    kind: "template",
    subject: "Confirm your email for Vistrial",
    filename: "confirmation.html",
    subjectKey: "mailer_subjects_confirmation",
    contentKey: "mailer_templates_confirmation_content",
    html: card({
      heading: "Confirm your email",
      lines: ["Use the button below to confirm this email address."],
      cta: { label: "Confirm email", href: CONFIRM },
      footnote: "If you didn't request this, you can ignore this email.",
    }),
  },
  {
    id: "recovery",
    kind: "template",
    subject: "Reset your Vistrial password",
    filename: "recovery.html",
    subjectKey: "mailer_subjects_recovery",
    contentKey: "mailer_templates_recovery_content",
    html: card({
      heading: "Reset your password",
      lines: ["We received a request to reset the password for {{ .Email }}."],
      cta: { label: "Reset password", href: CONFIRM },
      footnote: "If you didn't request this, you can ignore this email.",
    }),
  },
  {
    id: "invite",
    kind: "template",
    subject: "You've been invited to Vistrial",
    filename: "invite.html",
    subjectKey: "mailer_subjects_invite",
    contentKey: "mailer_templates_invite_content",
    html: card({
      heading: "You've been invited",
      lines: ["Use the button below to accept the invitation and set up your sign-in."],
      cta: { label: "Accept invitation", href: CONFIRM },
    }),
  },
  {
    id: "email_change",
    kind: "template",
    subject: "Confirm your new email address",
    filename: "email_change.html",
    subjectKey: "mailer_subjects_email_change",
    contentKey: "mailer_templates_email_change_content",
    html: card({
      heading: "Confirm your new email",
      lines: ["Use the button below to confirm {{ .NewEmail }} as your new email address."],
      cta: { label: "Confirm new email", href: CONFIRM },
      footnote: "If you didn't request this, you can ignore this email.",
    }),
  },
  {
    id: "reauthentication",
    kind: "template",
    subject: "{{ .Token }} is your Vistrial verification code",
    filename: "reauthentication.html",
    subjectKey: "mailer_subjects_reauthentication",
    contentKey: "mailer_templates_reauthentication_content",
    html: card({
      heading: "Your verification code",
      lines: ["Enter this code to confirm it's you. It expires shortly."],
      code: "{{ .Token }}",
    }),
  },
  {
    id: "password_changed",
    kind: "notification",
    subject: "Your Vistrial password was changed",
    filename: "password_changed.html",
    subjectKey: "mailer_subjects_password_changed_notification",
    contentKey: "mailer_templates_password_changed_notification_content",
    enabledKey: "mailer_notifications_password_changed_enabled",
    html: card({
      heading: "Your password was changed",
      lines: ["The password for your Vistrial account was changed."],
      footnote: "If you didn't make this change, reset your password and contact us.",
    }),
  },
  {
    id: "email_changed",
    kind: "notification",
    subject: "Your Vistrial email address was changed",
    filename: "email_changed.html",
    subjectKey: "mailer_subjects_email_changed_notification",
    contentKey: "mailer_templates_email_changed_notification_content",
    enabledKey: "mailer_notifications_email_changed_enabled",
    html: card({
      heading: "Your email address was changed",
      lines: ["The email for your account changed from {{ .OldEmail }} to {{ .Email }}."],
      footnote: "If you didn't make this change, contact us.",
    }),
  },
  {
    id: "phone_changed",
    kind: "notification",
    subject: "Your Vistrial phone number was changed",
    filename: "phone_changed.html",
    subjectKey: "mailer_subjects_phone_changed_notification",
    contentKey: "mailer_templates_phone_changed_notification_content",
    enabledKey: "mailer_notifications_phone_changed_enabled",
    html: card({
      heading: "Your phone number was changed",
      lines: ["The phone number for your account changed from {{ .OldPhone }} to {{ .Phone }}."],
      footnote: "If you didn't make this change, contact us.",
    }),
  },
  {
    id: "mfa_factor_enrolled",
    kind: "notification",
    subject: "A verification method was added to your Vistrial account",
    filename: "mfa_factor_enrolled.html",
    subjectKey: "mailer_subjects_mfa_factor_enrolled_notification",
    contentKey: "mailer_templates_mfa_factor_enrolled_notification_content",
    enabledKey: "mailer_notifications_mfa_factor_enrolled_enabled",
    html: card({
      heading: "A verification method was added",
      lines: ["{{ .FactorType }} was added to your Vistrial account."],
      footnote: "If you didn't make this change, contact us.",
    }),
  },
  {
    id: "mfa_factor_unenrolled",
    kind: "notification",
    subject: "A verification method was removed from your Vistrial account",
    filename: "mfa_factor_unenrolled.html",
    subjectKey: "mailer_subjects_mfa_factor_unenrolled_notification",
    contentKey: "mailer_templates_mfa_factor_unenrolled_notification_content",
    enabledKey: "mailer_notifications_mfa_factor_unenrolled_enabled",
    html: card({
      heading: "A verification method was removed",
      lines: ["{{ .FactorType }} was removed from your Vistrial account."],
      footnote: "If you didn't make this change, contact us.",
    }),
  },
  {
    id: "identity_linked",
    kind: "notification",
    subject: "A sign-in method was linked to your Vistrial account",
    filename: "identity_linked.html",
    subjectKey: "mailer_subjects_identity_linked_notification",
    contentKey: "mailer_templates_identity_linked_notification_content",
    enabledKey: "mailer_notifications_identity_linked_enabled",
    html: card({
      heading: "A sign-in method was linked",
      lines: ["Your {{ .Provider }} account was linked for {{ .Email }}."],
      footnote: "If you didn't make this change, contact us.",
    }),
  },
  {
    id: "identity_unlinked",
    kind: "notification",
    subject: "A sign-in method was removed from your Vistrial account",
    filename: "identity_unlinked.html",
    subjectKey: "mailer_subjects_identity_unlinked_notification",
    contentKey: "mailer_templates_identity_unlinked_notification_content",
    enabledKey: "mailer_notifications_identity_unlinked_enabled",
    html: card({
      heading: "A sign-in method was removed",
      lines: ["Your {{ .Provider }} account was removed for {{ .Email }}."],
      footnote: "If you didn't make this change, contact us.",
    }),
  },
];

/** Only the mailer fields. Does not touch Site URL, signup, or SMTP. */
export function authEmailManagementPayload(): Record<string, string | boolean> {
  const body: Record<string, string | boolean> = {};
  for (const template of AUTH_EMAIL_TEMPLATES) {
    body[template.subjectKey] = template.subject;
    body[template.contentKey] = template.html;
    if (template.enabledKey) body[template.enabledKey] = true;
  }
  return body;
}
