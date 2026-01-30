/**
 * Send Quote API Route
 * POST - Send a draft quote to the customer
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"
import { scheduleQuoteFollowUps, processQuoteTemplate, DEFAULT_FOLLOW_UP_TEMPLATES } from "@/lib/quotes/follow-ups"
import { getQuoteUrl } from "@/lib/constants/domains"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get quote with lead and profile
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(
        `
        *,
        leads(id, name, phone, email)
      `
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (quoteError || !quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 })
    }

    if (quote.status !== "draft") {
      return NextResponse.json({ error: "Quote has already been sent" }, { status: 400 })
    }

    // Get profile for Twilio credentials
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (!profile?.twilio_phone_number) {
      return NextResponse.json({ error: "Twilio not configured" }, { status: 400 })
    }

    const lead = quote.leads
    if (!lead) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    // Build quote link using proper subdomain
    const quoteLink = process.env.NODE_ENV === "development"
      ? `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/q/${quote.access_token}`
      : getQuoteUrl(quote.access_token)

    // Get custom template or use default
    const { data: template } = await supabase
      .from("quote_message_templates")
      .select("*")
      .eq("user_id", user.id)
      .eq("template_key", "quote_sent")
      .eq("channel", "sms")
      .single()

    const templateBody = template?.body || DEFAULT_FOLLOW_UP_TEMPLATES.quote_sent

    // Process template
    const message = processQuoteTemplate(templateBody, {
      firstName: lead.name?.split(" ")[0],
      total: quote.total,
      quoteLink,
      businessName: profile.business_name,
    })

    // Send SMS
    const result = await sendSMS({
      to: lead.phone,
      from: profile.twilio_phone_number,
      body: message,
      accountSid: profile.twilio_account_sid,
      authToken: profile.twilio_auth_token,
      statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/status`,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to send SMS" }, { status: 500 })
    }

    // Update quote status
    const now = new Date().toISOString()
    await supabase
      .from("quotes")
      .update({
        status: "sent",
        sent_at: now,
        updated_at: now,
      })
      .eq("id", id)

    // Log the message
    await supabase.from("messages").insert({
      lead_id: lead.id,
      user_id: user.id,
      direction: "outbound",
      status: "sent",
      to_phone: lead.phone,
      from_phone: profile.twilio_phone_number,
      body: message,
      twilio_sid: result.messageSid,
      sent_at: now,
    })

    // Schedule follow-ups
    await scheduleQuoteFollowUps(id)

    return NextResponse.json({
      success: true,
      quoteLink,
      messageSid: result.messageSid,
    })
  } catch (error) {
    console.error("Send quote error:", error)
    return NextResponse.json({ error: "Failed to send quote" }, { status: 500 })
  }
}
