import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    
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
      .select("twilio_account_sid, twilio_auth_token, twilio_phone_number")
      .eq("id", user.id)
      .single()

    if (profileError || !profile?.twilio_account_sid || !profile?.twilio_auth_token || !profile?.twilio_phone_number) {
      return NextResponse.json(
        { error: "Twilio not configured" },
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
    })
  } catch (error) {
    console.error("Send SMS error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
