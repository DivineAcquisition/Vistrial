/**
 * Push the Auth email templates to the hosted Vistrial project.
 * Sends only mailer_* fields. Site URL, signup, and SMTP stay as they are.
 *
 *   SUPABASE_ACCESS_TOKEN=... npx tsx scripts/push-auth-email-templates.ts
 */
import { authEmailManagementPayload } from "../src/lib/email/auth-templates";

const PROJECT_REF = "jizzmlvpnykazrsiotqq";

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set. The hosted templates were not changed.");
  process.exit(1);
}

const body = authEmailManagementPayload();
const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await response.text();
if (!response.ok) {
  console.error(`Auth config update failed (${response.status}).`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

let parsed: Record<string, unknown>;
try {
  parsed = JSON.parse(text) as Record<string, unknown>;
} catch {
  console.error("Auth config update returned a response that was not JSON.");
  process.exit(1);
}

const subject = parsed.mailer_subjects_magic_link;
const html = String(parsed.mailer_templates_magic_link_content ?? "");
if (subject !== "Your Vistrial sign-in link" || !html.includes("vistrial-lockup-ink.png")) {
  console.error("The hosted magic-link template did not come back with the Vistrial card.");
  process.exit(1);
}

console.log("Hosted Auth email templates updated on", PROJECT_REF);
