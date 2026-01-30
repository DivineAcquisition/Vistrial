/**
 * Quote API Routes
 * GET - List quotes
 * POST - Create quote
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { calculateQuote, DEFAULT_COST_SETTINGS } from "@/lib/quotes/calculations"
import { scheduleQuoteFollowUps, processQuoteTemplate, DEFAULT_FOLLOW_UP_TEMPLATES } from "@/lib/quotes/follow-ups"
import { sendSMS } from "@/lib/twilio/send-sms"
import type { QuoteInput, CostSettings, PricingTemplate } from "@/types/quotes"

// Generate a random access token
function generateAccessToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Generate quote number
async function generateQuoteNumber(userId: string, supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2)
  
  // Count quotes for this user this year
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString()
  const { count } = await supabase
    .from("quotes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfYear)

  const num = ((count || 0) + 1).toString().padStart(4, "0")
  return `Q${year}-${num}`
}

// GET - List quotes
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = supabase
      .from("quotes")
      .select(
        `
        *,
        leads(id, name, phone, email)
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (status && status !== "all") {
      query = query.eq("status", status)
    }

    const { data: quotes, error } = await query

    if (error) {
      console.error("Error fetching quotes:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ quotes })
  } catch (error) {
    console.error("GET quotes error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create quote
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: QuoteInput = await request.json()

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // Get pricing template (if exists)
    const { data: template } = await supabase
      .from("pricing_templates")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_default", true)
      .single()

    // Get cost settings (if exists)
    const { data: costSettingsData } = await supabase
      .from("cost_settings")
      .select("*")
      .eq("user_id", user.id)
      .single()

    const costSettings: CostSettings = costSettingsData || DEFAULT_COST_SETTINGS

    // Calculate quote
    const calculation = calculateQuote(
      {
        sqft: body.sqft,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        propertyCondition: body.property_condition,
        hasPets: body.has_pets,
      },
      (template as Partial<PricingTemplate>) || {},
      costSettings,
      body.adjustments || [],
      body.discount_amount || 0,
      body.custom_price
    )

    // Generate quote number and access token
    const quoteNumber = await generateQuoteNumber(user.id, admin)
    const accessToken = generateAccessToken()

    // Determine expiration (14 days from now)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    // Create quote
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        user_id: user.id,
        contact_id: body.contact_id,
        service_type_id: body.service_type_id || null,
        quote_number: quoteNumber,
        title: body.title || null,
        address_line1: body.address_line1 || null,
        city: body.city || null,
        state: body.state || null,
        zip: body.zip || null,
        sqft: body.sqft || null,
        bedrooms: body.bedrooms || null,
        bathrooms: body.bathrooms || null,
        property_type: body.property_type || null,
        property_condition: body.property_condition || "average",
        has_pets: body.has_pets || false,
        pet_details: body.pet_details || null,
        pricing_method: body.pricing_method || "variable",
        base_price: calculation.base_price,
        adjustments: calculation.adjustments,
        subtotal: calculation.subtotal,
        discount_amount: body.discount_amount || 0,
        discount_reason: body.discount_reason || null,
        total: calculation.total,
        estimated_hours: calculation.estimated_hours,
        labor_cost: calculation.labor_cost,
        supply_cost: calculation.supply_cost,
        travel_cost: calculation.travel_cost,
        total_cost: calculation.total_cost,
        profit_amount: calculation.profit_amount,
        profit_margin: calculation.profit_margin,
        status: body.send_immediately ? "sent" : "draft",
        sent_at: body.send_immediately ? new Date().toISOString() : null,
        expires_at: expiresAt.toISOString(),
        internal_notes: body.internal_notes || null,
        access_token: accessToken,
        follow_up_enabled: true,
        follow_up_paused: false,
        follow_up_count: 0,
      })
      .select()
      .single()

    if (quoteError) {
      console.error("Error creating quote:", quoteError)
      return NextResponse.json({ error: quoteError.message }, { status: 500 })
    }

    // Add line items if provided
    if (body.line_items?.length) {
      const { error: lineItemsError } = await supabase.from("quote_line_items").insert(
        body.line_items.map((item, index) => ({
          quote_id: quote.id,
          name: item.name,
          description: item.description || null,
          quantity: item.quantity || 1,
          unit_price: item.unit_price,
          total: (item.quantity || 1) * item.unit_price,
          is_optional: item.is_optional || false,
          is_selected: item.is_selected ?? true,
          display_order: index,
        }))
      )

      if (lineItemsError) {
        console.error("Error creating line items:", lineItemsError)
      }
    }

    const quoteLink = `${process.env.NEXT_PUBLIC_APP_URL}/q/${accessToken}`

    // Send quote if requested
    if (body.send_immediately && profile.twilio_phone_number) {
      // Get the lead/contact
      const { data: lead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", body.contact_id)
        .single()

      if (lead) {
        const message = processQuoteTemplate(DEFAULT_FOLLOW_UP_TEMPLATES.quote_sent, {
          firstName: lead.name?.split(" ")[0],
          total: calculation.total,
          quoteLink,
          businessName: profile.business_name,
        })

        await sendSMS({
          to: lead.phone,
          from: profile.twilio_phone_number,
          body: message,
          accountSid: profile.twilio_account_sid,
          authToken: profile.twilio_auth_token,
        })

        // Log message
        await supabase.from("messages").insert({
          lead_id: lead.id,
          user_id: user.id,
          direction: "outbound",
          status: "sent",
          to_phone: lead.phone,
          from_phone: profile.twilio_phone_number,
          body: message,
          sent_at: new Date().toISOString(),
        })

        // Schedule follow-ups
        await scheduleQuoteFollowUps(quote.id)
      }
    }

    return NextResponse.json({
      quote,
      calculation,
      quoteLink,
    })
  } catch (error) {
    console.error("POST quote error:", error)
    return NextResponse.json({ error: "Failed to create quote" }, { status: 500 })
  }
}
