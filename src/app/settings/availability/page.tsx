// ============================================
// Availability settings page
// ============================================

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AvailabilitySettings } from "@/components/settings/availability-settings";

export default async function AvailabilitySettingsPage() {
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

  const { data: availability } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .order("day_of_week");

  const { data: blackoutDates } = await supabase
    .from("blackout_dates")
    .select("*")
    .eq("business_id", business.id)
    .gte("date", new Date().toISOString().split("T")[0])
    .order("date");

  return (
    <AvailabilitySettings
      businessId={business.id}
      availability={availability || []}
      blackoutDates={blackoutDates || []}
    />
  );
}
