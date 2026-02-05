// @ts-nocheck
/**
 * Public Quote API Route
 * GET - Fetch quote by access token (no auth required)
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

interface RouteParams {
  params: Promise<{ token: string }>
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params
    const supabase = createAdminClient()

    // Get quote by access token
    const { data: quote, error } = await supabase
      .from("quotes")
      .select(`
        *,
        leads(id, name, phone, email)
      `)
      .eq("access_token", token)
      .single()

    if (error || !quote) {
      return NextResponse.json(
        { error: "Quote not found" },
        { status: 404 }
      )
    }

    // Get business profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("business_name, business_phone, email, logo_url, primary_color")
      .eq("id", quote.user_id)
      .single()

    // Mark as viewed if first time
    if (quote.status === "sent" && !quote.viewed_at) {
      await supabase
        .from("quotes")
        .update({
          status: "viewed",
          viewed_at: new Date().toISOString(),
        })
        .eq("id", quote.id)
    }

    // Format response
    const lead = quote.leads
    const responseQuote = {
      id: quote.id,
      quote_number: quote.quote_number,
      status: quote.viewed_at && quote.status === "sent" ? "viewed" : quote.status,
      total: quote.total,
      subtotal: quote.subtotal,
      discount_amount: quote.discount_amount || 0,
      bedrooms: quote.bedrooms,
      bathrooms: quote.bathrooms,
      address_line1: quote.address_line1,
      city: quote.city,
      state: quote.state,
      zip: quote.zip,
      property_condition: quote.property_condition,
      has_pets: quote.has_pets,
      estimated_hours: quote.estimated_hours,
      expires_at: quote.expires_at,
      created_at: quote.created_at,
      adjustments: quote.adjustments || [],
      business: {
        name: profile?.business_name || "Business",
        phone: profile?.business_phone,
        email: profile?.email,
        logo_url: profile?.logo_url,
        primary_color: profile?.primary_color,
      },
      contact: lead ? {
        first_name: lead.name?.split(" ")[0] || "",
        last_name: lead.name?.split(" ").slice(1).join(" ") || "",
        phone: lead.phone,
        email: lead.email,
      } : null,
    }

    return NextResponse.json({ quote: responseQuote })
  } catch (error) {
    console.error("Get public quote error:", error)
    return NextResponse.json(
      { error: "Failed to load quote" },
      { status: 500 }
    )
  }
}
