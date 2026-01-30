/**
 * Accept Quote API Route
 * POST - Accept a quote (converts to booking)
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"
import { cancelQuoteFollowUps, processQuoteTemplate, DEFAULT_FOLLOW_UP_TEMPLATES } from "@/lib/quotes/follow-ups"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const body = await request.json()
    const { scheduledDate, customerNotes } = body

    const supabase = createAdminClient()

    // Get quote with full details
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(
        `
        *,
        leads(id, name, phone, email)
      `
      )
      .eq("id", id)
      .single()

    if (quoteError || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    if (quote.status !== "sent" && quote.status !== "viewed") {
      return NextResponse.json(
        { error: "Quote cannot be accepted. It may have already been accepted or is still a draft." },
        { status: 400 }
      )
    }

    // Check if expired
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      return NextResponse.json({ error: "Quote has expired" }, { status: 400 })
    }

    // Get profile for sending confirmation
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", quote.user_id)
      .single()

    const lead = quote.leads
    const now = new Date().toISOString()

    // Update quote to accepted
    const { data: updatedQuote, error: updateError } = await supabase
      .from("quotes")
      .update({
        status: "accepted",
        responded_at: now,
        customer_notes: customerNotes || quote.customer_notes,
        updated_at: now,
      })
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      console.error("Error updating quote:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Update the lead status
    if (lead) {
      await supabase
        .from("leads")
        .update({
          status: "booked",
          updated_at: now,
        })
        .eq("id", lead.id)
    }

    // Cancel pending follow-ups
    await cancelQuoteFollowUps(id)

    // Send confirmation SMS if Twilio is configured
    if (profile?.twilio_phone_number && lead) {
      const message = processQuoteTemplate(DEFAULT_FOLLOW_UP_TEMPLATES.quote_accepted, {
        firstName: lead.name?.split(" ")[0],
        total: quote.total,
        businessName: profile.business_name,
        scheduledDate: scheduledDate || "soon",
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
        user_id: quote.user_id,
        direction: "outbound",
        status: "sent",
        to_phone: lead.phone,
        from_phone: profile.twilio_phone_number,
        body: message,
        sent_at: now,
      })
    }

    return NextResponse.json({
      success: true,
      quote: updatedQuote,
    })
  } catch (error) {
    console.error("Accept quote error:", error)
    return NextResponse.json({ error: "Failed to accept quote" }, { status: 500 })
  }
}
