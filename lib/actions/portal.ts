"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { reviewWindow } from "@/lib/appointments/review-window";
import { requireClient, requirePermission } from "@/lib/auth";
import { listAdSpend } from "@/lib/db/ad-spend";
import {
  deliverDisputeAlert,
  deliverInvitation,
} from "@/lib/notifications/portal";
import { baseUrl } from "@/lib/origin";
import { spreadAdSpend, upsertAdSpend } from "@/lib/portal/spend";
import { hashToken, mintToken } from "@/lib/portal/tokens";
import {
  acceptInviteSchema,
  adSpendRangeSchema,
  adSpendSchema,
  closePortalUserSchema,
  inviteSchema,
  portalDisputeSchema,
  revokeShareSchema,
  shareLinkSchema,
  weeklySummarySchema,
} from "@/lib/schemas/portal";
import { createServiceClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/session";
import type { Appointment, Client, ClientUser } from "@/types/database";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string };

function describeIssues(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function refreshClient(clientId: string): void {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/appointments");
  revalidatePath("/portal/billing");
  revalidatePath("/queue");
  revalidatePath("/appointments");
}

const INVITE_DAYS = 7;

export async function inviteClientUserAction(
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  const user = await requirePermission("manage_commercial");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { data: client, error: clientError } = await db
      .from("clients")
      .select("id, name")
      .eq("id", parsed.data.client_id)
      .returns<Pick<Client, "id" | "name">[]>()
      .maybeSingle();

    if (clientError) throw new Error(clientError.message);
    if (!client) return { ok: false, error: "That client no longer exists." };

    const token = mintToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: membership, error } = await db
      .from("client_users")
      .insert({
        client_id: client.id,
        name: parsed.data.name,
        email: parsed.data.email,
        status: "invited",
        invitation_token_hash: hashToken(token),
        invitation_expires_at: expiresAt,
        invited_by: user.id,
        invited_by_label: user.email,
      })
      .select("*")
      .returns<ClientUser[]>()
      .single();

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "That email already has a portal invitation for this client.",
        };
      }
      throw new Error(error.message);
    }

    const origin = await baseUrl();
    const inviteUrl = `${origin}/invite/${token}`;
    const delivery = await deliverInvitation(db, {
      client,
      membership,
      inviteUrl,
      expiresAt,
    });

    refreshClient(client.id);

    if (delivery.status === "failed") {
      return {
        ok: false,
        error: `The invitation was created, but the email did not send: ${delivery.error}`,
      };
    }

    return { ok: true, data: { email: membership.email } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export type AcceptInviteState = { error: string | null };

export async function acceptInviteAction(
  _previous: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });

  if (!parsed.success) {
    return { error: describeIssues(parsed.error) };
  }

  const db = createServiceClient();
  const hash = hashToken(parsed.data.token);

  const { data: membership, error } = await db
    .from("client_users")
    .select("*")
    .eq("invitation_token_hash", hash)
    .eq("status", "invited")
    .returns<ClientUser[]>()
    .maybeSingle();

  if (error) return { error: "Could not load that invitation." };
  if (!membership) {
    return { error: "That invitation is not valid, or it has already been used." };
  }

  if (
    membership.invitation_expires_at !== null &&
    Date.parse(membership.invitation_expires_at) <= Date.now()
  ) {
    return { error: "That invitation has expired. Ask your administrator for a new one." };
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: membership.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { name: membership.name, client_id: membership.client_id },
  });

  if (createError || !created.user) {
    // A previous partial accept may have left an auth user; try linking by email.
    if (createError?.message?.toLowerCase().includes("already")) {
      return {
        error:
          "An account already exists for this email. Sign in instead, or ask for a fresh invitation.",
      };
    }
    return {
      error: createError?.message ?? "Could not create the portal account.",
    };
  }

  const { error: linkError } = await db
    .from("client_users")
    .update({
      user_id: created.user.id,
      status: "active",
      accepted_at: new Date().toISOString(),
      invitation_token_hash: null,
      invitation_expires_at: null,
    })
    .eq("id", membership.id)
    .eq("status", "invited");

  if (linkError) {
    await db.auth.admin.deleteUser(created.user.id);
    return { error: linkError.message };
  }

  const session = await createSessionClient();
  const { error: signInError } = await session.auth.signInWithPassword({
    email: membership.email,
    password: parsed.data.password,
  });

  if (signInError) {
    return {
      error: "The account was created. Sign in with the password you just chose.",
    };
  }

  redirect("/portal");
}

export async function upsertAdSpendAction(input: unknown): Promise<ActionResult> {
  const user = await requirePermission("manage_commercial");
  const parsed = adSpendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    await upsertAdSpend(db, {
      clientId: parsed.data.client_id,
      spendDate: parsed.data.spend_date,
      amount: parsed.data.amount,
      campaignId: parsed.data.campaign_id,
      note: parsed.data.note || null,
      enteredBy: user.id,
      enteredByLabel: user.email,
    });
    refreshClient(parsed.data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function spreadAdSpendAction(input: unknown): Promise<ActionResult> {
  const user = await requirePermission("manage_commercial");
  const parsed = adSpendRangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    await spreadAdSpend(db, {
      clientId: parsed.data.client_id,
      start: parsed.data.start,
      end: parsed.data.end,
      total: parsed.data.total,
      campaignId: parsed.data.campaign_id,
      note: parsed.data.note || null,
      enteredBy: user.id,
      enteredByLabel: user.email,
    });
    refreshClient(parsed.data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function createShareLinkAction(
  input: unknown
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const user = await requirePermission("manage_commercial");
  const parsed = shareLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();
  const token = mintToken();
  const expiresAt = new Date(
    Date.now() + parsed.data.days * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    const { error } = await db.from("share_links").insert({
      client_id: parsed.data.client_id,
      token_hash: hashToken(token),
      label: parsed.data.label || null,
      created_by: user.id,
      created_by_label: user.email,
      expires_at: expiresAt,
    });

    if (error) throw new Error(error.message);

    const origin = await baseUrl();
    refreshClient(parsed.data.client_id);
    return {
      ok: true,
      data: { url: `${origin}/share/${token}`, expiresAt },
    };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function revokeShareLinkAction(input: unknown): Promise<ActionResult> {
  await requirePermission("manage_commercial");
  const parsed = revokeShareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { data, error } = await db
      .from("share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .is("revoked_at", null)
      .select("client_id")
      .returns<{ client_id: string }[]>()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { ok: false, error: "That link is already revoked." };

    refreshClient(data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function closePortalUserAction(input: unknown): Promise<ActionResult> {
  await requirePermission("manage_commercial");
  const parsed = closePortalUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { data, error } = await db
      .from("client_users")
      .update({
        status: "closed",
        access_ends_at: new Date().toISOString(),
        invitation_token_hash: null,
      })
      .eq("id", parsed.data.id)
      .select("client_id")
      .returns<{ client_id: string }[]>()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { ok: false, error: "That portal user no longer exists." };

    refreshClient(data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function setWeeklySummaryAction(
  input: unknown
): Promise<ActionResult> {
  const session = await requireClient();
  const parsed = weeklySummarySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  if (session.readOnly) {
    return { ok: false, error: "This account is read-only until access ends." };
  }

  const db = createServiceClient();

  try {
    const { error } = await db
      .from("client_users")
      .update({ weekly_summary: parsed.data.weekly_summary })
      .eq("id", session.membership.id);

    if (error) throw new Error(error.message);
    revalidatePath("/portal");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/**
 * A client disputes from the portal. Same status transition as the admin path,
 * attributed to the client themselves, and an administrator is told immediately.
 */
export async function portalDisputeAction(input: unknown): Promise<ActionResult> {
  const session = await requireClient();
  const parsed = portalDisputeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  if (session.readOnly) {
    return { ok: false, error: "This account is read-only and cannot raise disputes." };
  }

  const db = createServiceClient();

  try {
    const { data: appointment, error: loadError } = await db
      .from("appointments")
      .select("id, client_id, status, review_window_ends_at")
      .eq("id", parsed.data.id)
      .eq("client_id", session.membership.client_id)
      .returns<
        Pick<Appointment, "id" | "client_id" | "status" | "review_window_ends_at">[]
      >()
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!appointment) return { ok: false, error: "That appointment is not in your account." };

    const window = reviewWindow(appointment);
    if (window.state !== "open") {
      return {
        ok: false,
        error:
          window.state === "closed"
            ? "The review window has closed. Contact Divine Acquisition about a credit."
            : "Only a confirmed appointment inside its review window can be disputed.",
      };
    }

    const { error } = await db
      .from("appointments")
      .update({
        status: "disputed",
        last_actor: "client",
        last_actor_id: session.user.id,
        last_actor_label: session.membership.name,
        last_reason_code: null,
        last_reason: parsed.data.reason,
      })
      .eq("id", appointment.id)
      .eq("status", "confirmed")
      .eq("client_id", session.membership.client_id);

    if (error) throw new Error(error.message);

    const { data: client } = await db
      .from("clients")
      .select("id, name")
      .eq("id", session.membership.client_id)
      .returns<Pick<Client, "id" | "name">[]>()
      .maybeSingle();

    if (client) {
      const origin = await baseUrl();
      await deliverDisputeAlert(db, {
        client,
        membership: session.membership,
        appointmentId: appointment.id,
        reason: parsed.data.reason,
        queueUrl: `${origin}/queue`,
      });
    }

    refreshClient(session.membership.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/** Re-export for admin UI that lists spend without a separate page load. */
export async function listSpendForClient(clientId: string) {
  await requirePermission("manage_commercial");
  return listAdSpend(clientId);
}
