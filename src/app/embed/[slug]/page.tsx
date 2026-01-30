/**
 * Embeddable Booking Page
 * This page is loaded inside an iframe for embedding
 */

import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { EmbedBookingFlow } from "@/components/embed/EmbedBookingFlow"

interface EmbedPageProps {
  params: Promise<{ slug: string }>
}

export default async function EmbedPage({ params }: EmbedPageProps) {
  const { slug } = await params
  const supabase = createAdminClient()

  // Get business by slug
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("business_slug", slug)
    .eq("onboarding_complete", true)
    .single()

  if (error || !profile) {
    notFound()
  }

  // Get job types as service types
  const { data: jobTypes } = await supabase
    .from("job_types")
    .select("*")
    .eq("user_id", profile.id)
    .eq("is_active", true)

  // Transform to match expected format
  const serviceTypes = (jobTypes || []).map((jt) => ({
    id: jt.id,
    name: jt.name,
    description: jt.description || undefined,
    price_1bed: jt.default_amount || 100,
    price_2bed: (jt.default_amount || 100) + 20,
    price_3bed: (jt.default_amount || 100) + 40,
    price_4bed: (jt.default_amount || 100) + 60,
    price_5bed_plus: (jt.default_amount || 100) + 80,
    price_per_bathroom: 15,
  }))

  // If no job types, provide defaults
  const finalServiceTypes = serviceTypes.length > 0 ? serviceTypes : [
    {
      id: "standard",
      name: "Standard Clean",
      description: "Regular maintenance cleaning",
      price_1bed: 100,
      price_2bed: 120,
      price_3bed: 140,
      price_4bed: 180,
      price_5bed_plus: 220,
      price_per_bathroom: 15,
    },
    {
      id: "deep",
      name: "Deep Clean",
      description: "Thorough top-to-bottom cleaning",
      price_1bed: 150,
      price_2bed: 180,
      price_3bed: 210,
      price_4bed: 260,
      price_5bed_plus: 310,
      price_per_bathroom: 20,
    },
  ]

  const business = {
    id: profile.id,
    name: profile.business_name || "Cleaning Service",
    slug: slug,
    logo_url: profile.logo_url,
    primary_color: profile.primary_color || "#7c3aed",
    phone: profile.business_phone,
  }

  return (
    <EmbedBookingFlow
      business={business}
      serviceTypes={finalServiceTypes}
      serviceAreas={[]}
    />
  )
}
