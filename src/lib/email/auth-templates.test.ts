import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LEGAL_ENTITY } from "@/lib/constants";
import { AUTH_EMAIL_TEMPLATES, authEmailManagementPayload } from "@/lib/email/auth-templates";

const TEMPLATES = path.join(__dirname, "..", "..", "..", "supabase", "templates");

describe("auth email templates", () => {
  it("writes every Auth mail type with the wordmark and the Go field Auth fills in", () => {
    const ids = AUTH_EMAIL_TEMPLATES.map((template) => template.id);
    expect(ids).toEqual([
      "magic_link",
      "confirmation",
      "recovery",
      "invite",
      "email_change",
      "reauthentication",
      "password_changed",
      "email_changed",
      "phone_changed",
      "mfa_factor_enrolled",
      "mfa_factor_unenrolled",
      "identity_linked",
      "identity_unlinked",
    ]);

    for (const template of AUTH_EMAIL_TEMPLATES) {
      expect(template.html).toContain("https://app.vistrial.io/brand/vistrial-icon.png");
      expect(template.html).toContain("Vistrial will never ask for your password by email.");
      expect(template.html).toContain(`Vistrial is operated by ${LEGAL_ENTITY}`);
      expect(template.html.indexOf("vistrial-icon.png")).toBeLessThan(template.html.indexOf("<h1"));
      expect(template.html).toContain("{{ .SiteURL }}");
      const onDisk = readFileSync(path.join(TEMPLATES, template.filename), "utf8");
      expect(onDisk).toBe(template.html);
    }

    const link = AUTH_EMAIL_TEMPLATES.find((template) => template.id === "magic_link");
    expect(link?.html).toContain('href="{{ .ConfirmationURL }}"');
    expect(link?.html).not.toContain("&lt;");

    const code = AUTH_EMAIL_TEMPLATES.find((template) => template.id === "reauthentication");
    expect(code?.html).toContain("{{ .Token }}");
    expect(code?.subject).toContain("{{ .Token }}");
  });

  it("publishes only mailer fields, so a push cannot change the site URL", () => {
    const payload = authEmailManagementPayload();
    expect(payload.mailer_subjects_magic_link).toBe("Your Vistrial sign-in link");
    expect(payload.mailer_templates_invite_content).toContain("Accept invitation");
    expect(payload.mailer_notifications_password_changed_enabled).toBe(true);
    expect(Object.keys(payload).every((key) => key.startsWith("mailer_"))).toBe(true);
  });
});
