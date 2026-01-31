// ============================================
// Services management page
// ============================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ServicesSettings } from "@/components/settings/services-settings";

export default async function ServicesSettingsPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!business) redirect("/onboarding");

  const { data: services } = await supabase
    .from("service_types")
    .select("*")
    .eq("business_id", business.id)
    .order("display_order");

  return (
    <ServicesSettings businessId={business.id} services={services || []} />
  );
}
