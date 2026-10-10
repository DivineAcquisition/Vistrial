import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mayOpenBilling } from "@/lib/auth/portal-access";
import type { AuthContext } from "@/lib/auth/types";
import type { PaymentProblem } from "@/lib/billing/labels";
import { createClient } from "@/lib/supabase/server";

/** Only people who can open Billing see the banner; row security hides it from everyone else. */
export async function loadPaymentProblem(ctx: AuthContext): Promise<PaymentProblem | null> {
  if (!mayOpenBilling(ctx)) return null;
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db.from("workspace_billing").select("payment_failed_at").eq("org_id", ctx.org.id).maybeSingle();
  const since = (data as { payment_failed_at: string | null } | null)?.payment_failed_at;
  return since ? { since } : null;
}
