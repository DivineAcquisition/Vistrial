"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { runCycleJob } from "@/lib/billing/job";
import { storePaymentMethod } from "@/lib/billing/payment-method";
import { createSetupSession, ensureCustomer } from "@/lib/billing/stripe";
import { requireAdmin } from "@/lib/auth";
import { retryNotification } from "@/lib/notifications/charge";
import { baseUrl } from "@/lib/origin";
import { createServiceClient } from "@/lib/supabase/server";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { ChargeNotification, Client } from "@/types/database";

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

function refresh(clientId?: string | null): void {
  revalidatePath("/attention");
  revalidatePath("/billing");
  revalidatePath("/clients");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

async function loadClient(db: LedgerDb, id: string): Promise<Client | null> {
  const { data } = await db
    .from("clients")
    .select("*")
    .eq("id", id)
    .returns<Client[]>()
    .maybeSingle();

  return data ?? null;
}

const clientIdSchema = z.object({ client_id: z.uuid("Choose a client.") });

/**
 * Capture happens inside Stripe's own hosted flow. This produces the link the
 * client follows; no card detail ever passes through Vistrial.
 */
export async function createPaymentLinkAction(
  input: unknown
): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();

  const parsed = clientIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const client = await loadClient(db, parsed.data.client_id);
    if (!client) return { ok: false, error: "That client no longer exists." };

    const customer = await ensureCustomer({
      clientId: client.id,
      name: client.name,
      email: client.contact_email,
      existingCustomerId: client.stripe_customer_id,
    });

    if (!customer.ok) return { ok: false, error: customer.message };

    const session = await createSetupSession({
      customerId: customer.customerId,
      returnUrl: `${await baseUrl()}/api/billing/payment-method`,
    });

    if (!session.ok) return { ok: false, error: session.message };

    await db
      .from("clients")
      .update({
        stripe_customer_id: customer.customerId,
        payment_setup_session_id: session.sessionId,
      })
      .eq("id", client.id);

    refresh(client.id);
    return { ok: true, data: { url: session.url } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/**
 * Reads back a setup session the client has already completed. The return URL
 * does this automatically; this is for when the client closed the tab.
 */
export async function refreshPaymentMethodAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = clientIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const client = await loadClient(db, parsed.data.client_id);
    if (!client) return { ok: false, error: "That client no longer exists." };

    if (!client.payment_setup_session_id) {
      return {
        ok: false,
        error: "No payment method link has been issued for this client yet.",
      };
    }

    const result = await storePaymentMethod(db, client.id, client.payment_setup_session_id);
    if (!result.ok) return result;

    refresh(client.id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

const creditSchema = z.object({
  client_id: z.uuid("Choose a client."),
  amount: z.coerce.number().positive("A credit has to be worth something."),
  reason: z
    .string()
    .trim()
    .min(1, "Say what this credit is for. A credit with no reason reads as an error.")
    .max(1000),
  appointment_id: z.uuid().optional().or(z.literal("")),
});

/**
 * A processed charge never changes, so a correction is a credit against the
 * client, applied to reduce their next charge.
 */
export async function createCreditAction(input: unknown): Promise<ActionResult> {
  const user = await requireAdmin();

  const parsed = creditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { error } = await db.from("credits").insert({
      client_id: parsed.data.client_id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      appointment_id: parsed.data.appointment_id || null,
      created_by: user.id,
      created_by_label: user.email,
    });

    if (error) throw new Error(error.message);

    refresh(parsed.data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

const chargeIdSchema = z.object({ charge_id: z.uuid() });

/** Re-attempts an itemisation that did not reach the client. */
export async function resendChargeNoticeAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = chargeIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { data: notification } = await db
      .from("charge_notifications")
      .select("*")
      .eq("charge_id", parsed.data.charge_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<ChargeNotification[]>()
      .maybeSingle();

    if (!notification) {
      return { ok: false, error: "There is no notification recorded against that charge." };
    }

    const result = await retryNotification(db, notification);

    if (result.status !== "sent") {
      return { ok: false, error: result.error ?? "It could not be delivered." };
    }

    // The clock on the twenty-four hours starts when the client is actually told.
    if (notification.kind === "pre_charge") {
      await db
        .from("charges")
        .update({
          status: "notified",
          notified_at: new Date().toISOString(),
          scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", parsed.data.charge_id)
        .eq("status", "draft");
    }

    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/** The scheduled job, run by hand. Safe to run at any time, as often as wanted. */
export async function runCycleJobAction(): Promise<
  ActionResult<{ assembled: number; notified: number; processed: number; failed: number; skipped: number }>
> {
  await requireAdmin();

  try {
    const summary = await runCycleJob(createServiceClient(), { trigger: "manual" });

    revalidatePath("/billing");
    revalidatePath("/appointments");

    if (summary.error !== null) {
      return { ok: false, error: summary.error };
    }

    return {
      ok: true,
      data: {
        assembled: summary.assembled,
        notified: summary.notified,
        processed: summary.processed,
        failed: summary.failed,
        skipped: summary.skipped,
      },
    };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}
