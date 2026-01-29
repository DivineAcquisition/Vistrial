import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"
import { processTemplate, getTemplateVariables } from "@/lib/constants/template-variables"

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization")
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return processMessages()
}

export async function POST(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization")
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return processMessages()
}

async function processMessages() {
  const supabase = createAdminClient()
  const results: { success: number; failed: number; errors: string[] } = {
    success: 0,
    failed: 0,
    errors: [],
  }

  try {
    // Get leads pending action
    const { data: pendingLeads, error: fetchError } = await supabase
      .from("leads_pending_action")
      .select("*")
      .limit(50) // Process max 50 per run

    if (fetchError) {
      console.error("Error fetching pending leads:", fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!pendingLeads || pendingLeads.length === 0) {
      return NextResponse.json({ message: "No pending messages", results })
    }

    console.log(`Processing ${pendingLeads.length} pending messages`)

    for (const lead of pendingLeads) {
      try {
        // Get profile for template variables
        const { data: profile } = await supabase
          .from("profiles")
          .select("business_name, business_phone")
          .eq("id", lead.user_id)
          .single()

        // Process template
        const variables = getTemplateVariables(
          { name: lead.name, quote_amount: lead.quote_amount },
          { business_name: profile?.business_name, business_phone: profile?.business_phone }
        )
        const processedMessage = processTemplate(lead.message_template, variables)

        // Send SMS
        const result = await sendSMS({
          to: lead.phone,
          from: lead.twilio_phone_number,
          body: processedMessage,
          accountSid: lead.twilio_account_sid,
          authToken: lead.twilio_auth_token,
          statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/status`,
        })

        // Log the message
        await supabase.from("messages").insert({
          lead_id: lead.id,
          user_id: lead.user_id,
          direction: "outbound",
          status: result.success ? "sent" : "failed",
          to_phone: lead.phone,
          from_phone: lead.twilio_phone_number,
          body: processedMessage,
          sequence_id: lead.sequence_id,
          sequence_step: lead.current_step,
          twilio_sid: result.messageSid,
          error_code: result.errorCode,
          error_message: result.error,
          sent_at: result.success ? new Date().toISOString() : null,
        })

        if (result.success) {
          // Advance to next step
          await supabase.rpc("advance_lead_sequence", { p_lead_id: lead.id })
          results.success++
        } else {
          results.failed++
          results.errors.push(`Lead ${lead.id}: ${result.error}`)
        }
      } catch (leadError: any) {
        console.error(`Error processing lead ${lead.id}:`, leadError)
        results.failed++
        results.errors.push(`Lead ${lead.id}: ${leadError.message}`)
      }
    }

    return NextResponse.json({
      message: `Processed ${pendingLeads.length} messages`,
      results,
    })
  } catch (error: any) {
    console.error("Cron job error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
