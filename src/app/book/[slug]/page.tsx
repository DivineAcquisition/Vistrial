import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookingFlow } from "@/components/booking/booking-flow";

interface BookingPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BookingPageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!business) {
    return { title: "Business Not Found" };
  }

  return {
    title: `Book with ${business.name} | Vistrial`,
    description: `Schedule your cleaning appointment with ${business.name}`,
  };
}

export default async function BookingPage({ params }: BookingPageProps) {
  const { slug } = await params;
  const supabase = createAdminClient();

  // Get business with services
  const { data: business } = await supabase
    .from("businesses")
    .select(`
      *,
      service_types(*)
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!business) {
    notFound();
  }

  // Get service areas
  const { data: serviceAreas } = await supabase
    .from("service_areas")
    .select("zip")
    .eq("business_id", business.id);

  // Get availability
  const { data: availability } = await supabase
    .from("availability")
    .select("*")
    .eq("business_id", business.id)
    .eq("is_available", true);

  // Filter active services and sort
  const activeServices = (business.service_types || [])
    .filter((s: { is_active?: boolean }) => s.is_active)
    .sort((a: { display_order?: number }, b: { display_order?: number }) => 
      (a.display_order || 0) - (b.display_order || 0)
    );

  return (
    <BookingFlow
      business={business}
      services={activeServices}
      serviceAreas={serviceAreas?.map((s) => s.zip) || []}
      availability={availability || []}
    />
  );
}
