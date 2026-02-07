// ============================================
// Stripe Connect settings page
// ============================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StripeConnectSettings } from "@/components/settings/stripe-connect-settings";

export default async function PaymentSettingsPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (!business) redirect("/onboarding");

  return <StripeConnectSettings business={business} />;
}
