"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "@/lib/ghl/crypto";
import type { GhlDb } from "@/lib/ghl/tokens";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { checkDomainRecords } from "@/lib/onboarding/email-domain-check";
import { readRecords } from "@/lib/onboarding/email-domain";
import { validateRegistration, type RegistrationDetails } from "@/lib/onboarding/registration";
import { startSampleRun } from "@/lib/onboarding/sample";
import { excerpt } from "@/lib/portal/help";
import { emailStaff } from "@/lib/portal/notices";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The Owner's setup actions. Each runs as the person, so the database checks
 * again that they may (Owner or staff of this workspace) and records who did
 * it. The service-role client is used only where the work needs it (reading
 * the encrypted registration back to merge a correction, recording a lookup,
 * starting the sample test), after the same check.
 */

export type SetupResult = { ok: true; message?: string } | { ok: false; error: string; fields?: Record<string, string> };

async function userDb(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

function admin(): SupabaseClient {
  return getSupabaseAdmin() as unknown as SupabaseClient;
}

function message(error: { message?: string; code?: string } | null, fallback: string): string {
  const text = error?.message?.trim();
  if (text && (error?.code === "22023" || error?.code === "42501") && /^[A-Z][^\n]{3,240}\.$/.test(text)) return text;
  return fallback;
}

async function ownerOrStaff() {
  const ctx = await getAuthContext();
  if (!(ctx.isStaff || ctx.workspaceRole === "owner")) return { ok: false as const, error: "Only an owner can change setup.", ctx };
  return { ok: true as const, ctx };
}

function done(path?: string) {
  revalidatePath("/app/onboarding", "layout");
  revalidatePath("/app/home");
  if (path) revalidatePath(path);
}

export async function markWelcomeSeen(): Promise<SetupResult> {
  const ctx = await getAuthContext();
  const db = await userDb();
  const { error } = await db.rpc("onboarding_member_flag", { p_org_id: ctx.org.id, p_flag: "welcome" });
  if (error) return { ok: false, error: "Could not save that. Try again." };
  done();
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function confirmApproach(): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("onboarding_confirm_approach", { p_org_id: gate.ctx.org.id });
  if (error) return { ok: false, error: message(error, "Could not confirm. Try again.") };
  done();
  return { ok: true, message: "Confirmed." };
}

export async function requestApproachChange(note: string): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const text = note.trim();
  if (text.length < 3) return { ok: false, error: "Tell your team what you would like to change." };
  const db = await userDb();
  const { error } = await db.rpc("onboarding_request_approach_change", { p_org_id: gate.ctx.org.id, p_note: text.slice(0, 1000) });
  if (error) return { ok: false, error: message(error, "Could not send that. Try again.") };
  await emailStaff({
    orgId: gate.ctx.org.id,
    subject: `${gate.ctx.org.name}: change to the approach requested`,
    lines: [`${gate.ctx.member.displayName} asked for a change to the approach.`, excerpt(text)],
    href: `/app/team/onboarding/${gate.ctx.org.id}`,
    ctaLabel: "Open the workbench",
    idempotencyKey: `onboarding-approach:${gate.ctx.org.id}:${Date.now()}`,
  });
  done();
  return { ok: true, message: "Sent to your team. They will let you know when it is ready." };
}

export async function requestCrmHelp(crmName: string): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("onboarding_request_crm_help", { p_org_id: gate.ctx.org.id, p_crm_name: crmName.trim().slice(0, 80) || null });
  if (error) return { ok: false, error: message(error, "Could not send that. Try again.") };
  done();
  return { ok: true, message: "Your team has been asked. They will be in touch." };
}

export async function setChannel(channel: "texting" | "email", enabled: boolean, reason: string): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("onboarding_set_channel", {
    p_org_id: gate.ctx.org.id,
    p_channel: channel,
    p_enabled: enabled,
    p_reason: reason.trim().slice(0, 300) || null,
  });
  if (error) return { ok: false, error: message(error, "Could not save that. Try again.") };
  done();
  return { ok: true };
}

/**
 * Registration details. Merged over what was saved before, so fixing one
 * field after a rejection never wipes the rest; encrypted before storing;
 * never logged. A tax ID is refused here and in the database.
 */
export async function saveRegistration(input: Record<string, string>): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { data: existing } = await admin()
    .from("messaging_registration_details")
    .select("details_ciphertext")
    .eq("org_id", gate.ctx.org.id)
    .maybeSingle();
  let previous: RegistrationDetails = {};
  const cipher = (existing as { details_ciphertext?: string | null } | null)?.details_ciphertext;
  if (cipher) {
    try {
      previous = JSON.parse(decryptSecret(cipher)) as RegistrationDetails;
    } catch {
      previous = {};
    }
  }
  const checked = validateRegistration(input, previous);
  if (!checked.ok) {
    const fields = Object.fromEntries(Object.entries(checked.errors).filter(([, value]) => Boolean(value))) as Record<string, string>;
    return { ok: false, error: fields.form ?? "Check the highlighted fields.", fields };
  }
  let ciphertext: string;
  try {
    ciphertext = encryptSecret(JSON.stringify(checked.details));
  } catch {
    return { ok: false, error: "The details could not be stored securely right now. Your team has been told." };
  }
  const { error } = await (await userDb()).rpc("messaging_registration_save", {
    p_org_id: gate.ctx.org.id,
    p_ciphertext: ciphertext,
    p_field_names: checked.fieldNames,
    p_complete: checked.complete,
  });
  if (error) return { ok: false, error: message(error, "Could not save the details. Try again.") };
  done();
  return {
    ok: true,
    message: checked.complete
      ? "Saved. Your team will submit your registration and ask you for your tax ID directly."
      : "Saved. Add the rest when you have it.",
  };
}

export async function checkEmailDomain(): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  // The person may act on this workspace (checked above). The lookup itself
  // is recorded with the service role so a browser cannot claim "verified".
  const { data } = await admin().from("email_domain_setup").select("domain, records").eq("org_id", gate.ctx.org.id).maybeSingle();
  const setup = data as { domain: string | null; records: unknown } | null;
  const records = readRecords(setup?.records);
  if (!records.length) return { ok: false, error: "Your team has not added the records yet." };
  const { results, verified } = await checkDomainRecords(setup?.domain ?? null, records);
  const { error } = await admin().rpc("email_domain_record_check", {
    p_org_id: gate.ctx.org.id,
    p_result: results,
    p_verified: verified,
    p_actor: gate.ctx.user.id,
  });
  if (error) return { ok: false, error: "Could not record the check. Try again." };
  done();
  const found = results.filter((result) => result.found).length;
  return verified
    ? { ok: true, message: "All records found. Your email domain is verified." }
    : { ok: true, message: `${found} of ${results.length} records found. New records can take a few hours to appear.` };
}

export async function askTeamForEmail(): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("email_domain_ask_team", { p_org_id: gate.ctx.org.id });
  if (error) return { ok: false, error: message(error, "Could not send that. Try again.") };
  done();
  return { ok: true, message: "Your team will set this up and tell you if they need anything." };
}

export async function saveEscalationContacts(contacts: Array<{ member_id?: string; invite_id?: string; channel: string }>): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("escalation_contacts_save", { p_org_id: gate.ctx.org.id, p_contacts: contacts });
  if (error) return { ok: false, error: message(error, "Could not save the contacts. Try again.") };
  done();
  return { ok: true, message: "Saved." };
}

/** A test notification to one contact, on their channel. They confirm from it. */
export async function sendContactTest(contactId: string): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const db = await userDb();
  const { data } = await db
    .from("workspace_escalation_contacts")
    .select("id, member_id, channel, display_name")
    .eq("id", contactId)
    .eq("org_id", gate.ctx.org.id)
    .maybeSingle();
  const contact = data as { id: string; member_id: string | null; channel: "push" | "email" | "sms"; display_name: string } | null;
  if (!contact) return { ok: false, error: "That contact is no longer on the list." };
  if (!contact.member_id) return { ok: false, error: "They need to accept their invitation first. The test goes out once they have." };
  const { data: member } = await admin().from("org_members").select("user_id").eq("id", contact.member_id).eq("org_id", gate.ctx.org.id).maybeSingle();
  const userId = (member as { user_id?: string } | null)?.user_id;
  if (!userId) return { ok: false, error: "That person is no longer in this workspace." };
  await enqueueNotification(admin() as unknown as GhlDb, {
    orgId: gate.ctx.org.id,
    eventType: "test_send",
    channel: contact.channel,
    recipientUserId: userId,
    recipientMemberId: contact.member_id,
    subjectIds: [],
    title: "A test from Vistrial",
    body: "You are an escalation contact. Open this to confirm you got it.",
    href: `/app/onboarding/confirm-contact/${contact.id}`,
    dedupeKey: `escalation-test:${contact.id}:${Date.now()}`,
    isTest: true,
  });
  await admin().rpc("escalation_contact_test_sent", { p_contact_id: contact.id });
  done();
  return { ok: true, message: `Test sent to ${contact.display_name}. They confirm it from the notification.` };
}

export async function setTeamStep(state: "done" | "later" | null): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("onboarding_set_team_step", { p_org_id: gate.ctx.org.id, p_state: state });
  if (error) return { ok: false, error: message(error, "Could not save that. Try again.") };
  done();
  return { ok: true };
}

export async function startImport(lookbackDays: number): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("onboarding_import_start", { p_org_id: gate.ctx.org.id, p_lookback_days: Math.round(lookbackDays) });
  if (error) return { ok: false, error: message(error, "Could not start the import. Try again.") };
  done();
  return { ok: true, message: "Started. You can leave this page; it carries on in the background." };
}

export async function decideImportProblem(problemId: string, decision: "keep" | "skip"): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("onboarding_import_problem_decide", { p_problem_id: problemId, p_decision: decision });
  if (error) return { ok: false, error: message(error, "Could not save that. Try again.") };
  done();
  return { ok: true };
}

export async function startSampleTest(): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  // The database decides again: only an Owner or this workspace's staff may refresh it.
  const { error } = await (await userDb()).rpc("onboarding_refresh", { p_org_id: gate.ctx.org.id });
  if (error) return { ok: false, error: "You cannot run the test in this workspace." };
  try {
    await startSampleRun(admin(), {
      orgId: gate.ctx.org.id,
      actorUserId: gate.ctx.user.id,
      actorLabel: gate.ctx.member.displayName,
      from: gate.ctx.isStaff ? "staff" : "customer",
    });
  } catch {
    return { ok: false, error: "The test could not start. Your team has been told. Try again in a minute." };
  }
  done();
  return { ok: true };
}

export async function confirmSampleTest(runId: string, worked: boolean, what: string): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const db = await userDb();
  let requestId: string | null = null;
  if (!worked) {
    const text = what.trim();
    if (text.length < 3) return { ok: false, error: "Tell your team what looked wrong." };
    const { data, error } = await db.rpc("help_request_create", {
      p_org_id: gate.ctx.org.id,
      p_topic: "onboarding",
      p_message: `Problem with the sample lead test (test ${runId.slice(0, 8)}): ${text.slice(0, 3500)}`,
      p_page_path: "/app/onboarding/step/test",
      p_lead_id: null,
    });
    if (error) return { ok: false, error: "Could not send that. Try again." };
    requestId = data as string;
    await emailStaff({
      orgId: gate.ctx.org.id,
      subject: `${gate.ctx.org.name}: problem with the sample lead test`,
      lines: [`${gate.ctx.member.displayName} reported a problem with the sample lead test.`, excerpt(text)],
      href: `/app/team/requests/${requestId}`,
      ctaLabel: "Reply",
      idempotencyKey: `help-request:${requestId}`,
    });
  }
  const { error } = await db.rpc("onboarding_sample_confirm", { p_run_id: runId, p_worked: worked, p_help_request_id: requestId });
  if (error) return { ok: false, error: message(error, "Could not save that. Try again.") };
  // The sample lead and everything that names it are removed now.
  await db.rpc("onboarding_sample_cleanup", { p_run_id: runId });
  done();
  return { ok: true, message: worked ? "Thanks. The sample lead has been removed." : "Sent to your team. The sample lead has been removed." };
}

export async function confirmReady(): Promise<SetupResult> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner") return { ok: false, error: "The workspace owner confirms this." };
  const { error } = await (await userDb()).rpc("onboarding_owner_confirm", { p_org_id: ctx.org.id });
  if (error) return { ok: false, error: message(error, "Could not send that. Try again.") };
  done();
  return { ok: true, message: "Your team has been told. They will review everything and approve going live." };
}

export async function confirmEscalationContact(contactId: string): Promise<SetupResult> {
  const { error } = await (await userDb()).rpc("escalation_contact_confirm", { p_contact_id: contactId });
  if (error) return { ok: false, error: "This test is not for you." };
  done();
  return { ok: true, message: "Thanks. You will be told when a lead waits too long." };
}

export async function submitFeedback(rating: number, comment: string): Promise<SetupResult> {
  const ctx = await getAuthContext();
  if (ctx.workspaceRole !== "owner") return { ok: false, error: "Not available." };
  const db = await userDb();
  let requestId: string | null = null;
  const text = comment.trim();
  if (text) {
    const { data } = await db.rpc("help_request_create", {
      p_org_id: ctx.org.id,
      p_topic: "onboarding",
      p_message: `First week feedback (${rating} of 5): ${text.slice(0, 3800)}`,
      p_page_path: "/app/home",
      p_lead_id: null,
    });
    requestId = (data as string | null) ?? null;
    if (requestId) {
      await emailStaff({
        orgId: ctx.org.id,
        subject: `${ctx.org.name}: first week feedback (${rating} of 5)`,
        lines: [excerpt(text)],
        href: `/app/team/requests/${requestId}`,
        ctaLabel: "Reply",
        idempotencyKey: `help-request:${requestId}`,
      });
    }
  }
  const { error } = await db.rpc("onboarding_feedback_submit", { p_org_id: ctx.org.id, p_rating: rating, p_comment: text || null, p_help_request_id: requestId });
  if (error) return { ok: false, error: message(error, "Could not send that. Try again.") };
  revalidatePath("/app/home");
  return { ok: true, message: "Thank you. Your team will read it." };
}

export async function dismissFeedback(): Promise<SetupResult> {
  const ctx = await getAuthContext();
  await (await userDb()).rpc("onboarding_member_flag", { p_org_id: ctx.org.id, p_flag: "feedback" });
  revalidatePath("/app/home");
  return { ok: true };
}

export async function decideImportProblemKind(kind: string, decision: "keep" | "skip"): Promise<SetupResult> {
  const gate = await ownerOrStaff();
  if (!gate.ok) return gate;
  const { error } = await (await userDb()).rpc("onboarding_import_problems_decide_kind", { p_org_id: gate.ctx.org.id, p_kind: kind, p_decision: decision });
  if (error) return { ok: false, error: message(error, "Could not save that. Try again.") };
  done();
  return { ok: true, message: decision === "keep" ? "Kept." : "Left out." };
}
