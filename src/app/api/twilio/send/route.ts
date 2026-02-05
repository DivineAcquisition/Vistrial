// @ts-nocheck
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"
import { checkSendCompliance, validateMessageContent } from "@/lib/sms/compliance"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { leadId, message } = body

    if (!leadId || !message) {
      return NextResponse.json(
        { error: "leadId and message are required" },
        { status: 400 }
      )
    }

    // Get lead and verify ownership
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("user_id", user.id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }

    // Get user profile for Twilio credentials
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number, business_name, timezone")
      .eq("id", user.id)
      .single()

    if (profileError || !profile?.twilio_account_sid || !profile?.twilio_auth_token || !profile?.twilio_phone_number) {
      return NextResponse.json(
        { error: "Twilio not configured" },
        { status: 400 }
      )
    }

    // Check if phone is on opt-out list
    const { data: optOut } = await supabase
      .from("opt_outs")
      .select("id, opted_out_at")
      .eq("user_id", user.id)
      .eq("phone", lead.phone)
      .single()

    const isOptedOut = !!optOut

    // Run compliance checks before sending
    const complianceCheck = await checkSendCompliance({
      lead: {
        phone: lead.phone,
        status: lead.status,
        consent_timestamp: lead.consent_timestamp,
        created_at: lead.created_at,
        timezone: lead.timezone,
      },
      profileTimezone: profile.timezone || "America/New_York",
      isOptedOut,
    })

    if (!complianceCheck.canSend) {
      return NextResponse.json(
        {
          error: complianceCheck.reason,
          complianceBlocked: true,
          nextValidTime: complianceCheck.nextValidTime?.toISOString(),
        },
        { status: 400 }
      )
    }

    // Validate message content (warnings, not blocking)
    const isFirstMessage = lead.current_step === 0 || lead.current_step === 1
    const messageValidation = validateMessageContent(
      message,
      profile.business_name || "Business",
      isFirstMessage
    )

    // Block if there are errors (e.g., first message without opt-out)
    if (!messageValidation.isValid) {
      return NextResponse.json(
        {
          error: messageValidation.errors.join(". "),
          validationErrors: messageValidation.errors,
          validationWarnings: messageValidation.warnings,
        },
        { status: 400 }
      )
    }

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
      return NextResponse.json(
        { error: result.error || "Failed to send SMS" },
        { status: 500 }
      )
    }

    // Log the message
    const { data: messageRecord, error: messageError } = await supabase
      .from("messages")
      .insert({
        lead_id: leadId,
        user_id: user.id,
        direction: "outbound",
        status: "sent",
        to_phone: lead.phone,
        from_phone: profile.twilio_phone_number,
        body: message,
        twilio_sid: result.messageSid,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (messageError) {
      console.error("Error logging message:", messageError)
    }

    return NextResponse.json({
      success: true,
      messageSid: result.messageSid,
      message: messageRecord,
      warnings: messageValidation.warnings,
    })
  } catch (error) {
    console.error("Send SMS error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
