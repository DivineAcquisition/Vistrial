import { readSetupSession } from "@/lib/billing/stripe";
import type { LedgerDb } from "@/lib/supabase/ledger";

export type StoreResult = { ok: true } | { ok: false; error: string };

/**
 * Stores the processor's references and the card metadata it reports back —
 * brand, last four, expiry — and nothing else. There is no code path in this
 * system that could store a card number, because one never arrives.
 */
export async function storePaymentMethod(
  db: LedgerDb,
  clientId: string,
  sessionId: string
): Promise<StoreResult> {
  const session = await readSetupSession(sessionId);
  if (!session.ok) return { ok: false, error: session.message };

  const { error } = await db
    .from("clients")
    .update({
      ...(session.customerId ? { stripe_customer_id: session.customerId } : {}),
      stripe_payment_method_id: session.paymentMethodId,
      card_brand: session.card.brand,
      card_last4: session.card.last4,
      card_exp_month: session.card.expMonth,
      card_exp_year: session.card.expYear,
      payment_method_added_at: new Date().toISOString(),
    })
    .eq("id", clientId);

  if (error) {
    return { ok: false, error: `Could not store the payment method: ${error.message}` };
  }

  return { ok: true };
}
