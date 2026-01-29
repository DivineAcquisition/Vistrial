import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { sendSMS } from "@/lib/twilio/send-sms"
import { processTemplate, getTemplateVariables } from "@/lib/constants/template-variables"
import { checkSendCompliance } from "@/lib/sms/compliance"
import { isFirstMessage, ensureOptOutIncluded } from "@/lib/constants/sms-compliance"

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

interface ProcessingResults {
  success: number
  failed: number
  skipped: number
  rescheduled: number
  errors: string[]
}

async function processMessages() {
  const supabase = createAdminClient()
  const results: ProcessingResults = {
    success: 0,
    failed: 0,
    skipped: 0,
    rescheduled: 0,
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
        // Get profile for template variables and Twilio credentials
        const { data: profile } = await supabase
          .from("profiles")
          .select("business_name, business_phone, timezone")
          .eq("id", lead.user_id)
          .single()

        // Check if phone is on opt-out list
        const { data: optOut } = await supabase
          .from("opt_outs")
          .select("id")
          .eq("user_id", lead.user_id)
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
          profileTimezone: profile?.timezone || "America/New_York",
          isOptedOut,
          skipWeekends: lead.skip_weekends || false,
        })

        // Handle compliance check results
        if (!complianceCheck.canSend) {
          if (complianceCheck.requiresScheduling && complianceCheck.nextValidTime) {
            // Reschedule for next valid time
            await supabase
              .from("leads")
              .update({ next_action_at: complianceCheck.nextValidTime.toISOString() })
              .eq("id", lead.id)

            console.log(
              `Lead ${lead.id} rescheduled to ${complianceCheck.nextValidTime.toISOString()}: ${complianceCheck.reason}`
            )
            results.rescheduled++
          } else {
            // Cannot send - skip permanently for this step
            console.log(`Lead ${lead.id} skipped: ${complianceCheck.reason}`)
            results.skipped++
            results.errors.push(`Lead ${lead.id} skipped: ${complianceCheck.reason}`)
          }
          continue
        }

        // Process template
        const variables = getTemplateVariables(
          { name: lead.name, quote_amount: lead.quote_amount },
          { business_name: profile?.business_name, business_phone: profile?.business_phone }
        )
        let processedMessage = processTemplate(lead.message_template, variables)

        // Ensure first message includes opt-out instructions (TCPA requirement)
        if (isFirstMessage(lead.current_step)) {
          processedMessage = ensureOptOutIncluded(processedMessage)
        }

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
