import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BookingDetail } from "@/components/bookings/booking-detail";

export const dynamic = "force-dynamic";

interface BookingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get business
  let business = null;
  const { data: businessData } = await supabase
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (businessData) {
    business = businessData;
  } else {
    const { data: profile } = await supabase
      .from("profiles" as "user_profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (profile) {
      business = { id: (profile as { id: string }).id };
    }
  }

  if (!business) redirect("/onboarding");

  // Get booking with all related data
  const { data: booking } = await supabase
    .from("bookings")
    .select(
      `
      *,
      contacts(*),
      service_types(*),
      memberships(*),
      booking_addons(
        *,
        addon:service_addons(*)
      )
    `
    )
    .eq("id", id)
    .eq("business_id", business.id)
    .single();

  if (!booking) notFound();

  // Get message history
  let messages: Array<{
    id: string;
    body: string;
    direction: string;
    created_at: string;
  }> = [];

  try {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    messages = (data || []) as typeof messages;
  } catch {
    // Messages table may not exist
  }

  return <BookingDetail booking={booking} messages={messages} />;
}
