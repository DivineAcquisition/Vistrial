// ============================================
// Service areas settings page
// ============================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ServiceAreasSettings } from "@/components/settings/service-areas-settings";

export default async function ServiceAreasSettingsPage() {
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

  const { data: serviceAreas } = await supabase
    .from("service_areas")
    .select("*")
    .eq("business_id", business.id)
    .order("zip");

  return (
    <ServiceAreasSettings
      businessId={business.id}
      serviceAreas={serviceAreas || []}
    />
  );
}
