"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  createPaymentLinkAction,
  resendChargeNoticeAction,
} from "@/lib/actions/billing";
import { setDigestHour } from "@/lib/attention/digest";
import { requireAdmin } from "@/lib/auth";
import { processCharge } from "@/lib/billing/processing";
import { createServiceClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string };

function refresh(): void {
  revalidatePath("/attention");
  revalidatePath("/billing");
  revalidatePath("/queue");
  revalidatePath("/appointments");
  revalidatePath("/clients");
}

const chargeId = z.object({ charge_id: z.uuid() });
const clientId = z.object({ client_id: z.uuid() });
const hourSchema = z.object({
  hour: z.coerce.number().int().min(0).max(23),
});

/** Retry a failed charge now. Uses the existing processor path unchanged. */
export async function retryFailedChargeAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = chargeId.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Choose a charge." };
  }

  try {
    const result = await processCharge(
      createServiceClient(),
      parsed.data.charge_id,
      new Date(),
      "failed"
    );

    refresh();

    if (result.kind === "paid") return { ok: true };
    if (result.kind === "failed") {
      return { ok: false, error: result.reason };
    }
    return { ok: false, error: result.reason };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Retry failed.",
    };
  }
}

export async function attentionResendNoticeAction(
  input: unknown
): Promise<ActionResult> {
  const result = await resendChargeNoticeAction(input);
  revalidatePath("/attention");
  return result;
}

export async function attentionSendPaymentLinkAction(
  input: unknown
): Promise<ActionResult<{ url: string }>> {
  const parsed = clientId.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a client." };

  const result = await createPaymentLinkAction(parsed.data);
  revalidatePath("/attention");
  return result;
}

export async function setDigestHourAction(
  input: unknown
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = hourSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Choose an hour between 0 and 23 UTC." };
  }

  try {
    await setDigestHour(createServiceClient(), parsed.data.hour);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save.",
    };
  }
}
