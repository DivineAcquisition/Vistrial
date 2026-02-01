import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseTwilioWebhook, generateTwiMLResponse } from "@/lib/twilio/validate-webhook"
import {
  isOptOutMessage,
  isResubscribeMessage,
  isHelpMessage,
  getOptOutKeyword,
  COMPLIANCE_MESSAGES,
} from "@/lib/constants/sms-compliance"
import { detectSentiment, detectBookingIntent } from "@/lib/twilio/opt-out"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const webhook = parseTwilioWebhook(formData)

    console.log("Twilio webhook received:", {
      from: webhook.from,
      to: webhook.to,
      body: webhook.body?.substring(0, 50),
    })

    // Use admin client for webhook processing
    const supabase = createAdminClient()

    // Find the user/profile associated with this Twilio number (to phone)
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, business_name, business_phone, twilio_account_sid, twilio_auth_token")
      .eq("twilio_phone_number", webhook.to)
      .single()

    const businessName = profile?.business_name || "us"
    const businessPhone = profile?.business_phone || ""

    // Check for compliance keywords BEFORE processing normal message
    
    // 1. Handle OPT-OUT keywords (STOP, UNSUBSCRIBE, etc.)
    if (isOptOutMessage(webhook.body)) {
      console.log("Opt-out request received from:", webhook.from)
      
      const optOutKeyword = getOptOutKeyword(webhook.body)
      
      if (profile) {
        // Record the opt-out
        await supabase.from("opt_outs").upsert(
          {
            user_id: profile.id,
            phone: webhook.from,
            reason: optOutKeyword,
            opted_out_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,phone",
          }
        )

        // Update any leads with this phone to opted_out status
        await supabase
          .from("leads")
          .update({
            status: "opted_out",
            next_action_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", profile.id)
          .eq("phone", webhook.from)
      }

      // Log the inbound message
      await logInboundMessage(supabase, webhook, profile?.id)

      // Send opt-out confirmation (required by TCPA)
      const confirmationMessage = COMPLIANCE_MESSAGES.optOutConfirmation(businessName)
      return new NextResponse(generateTwiMLResponse(confirmationMessage), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      })
    }

    // 2. Handle RESUBSCRIBE keywords (START, UNSTOP, etc.)
    if (isResubscribeMessage(webhook.body)) {
      console.log("Resubscribe request received from:", webhook.from)
      
      if (profile) {
        // Remove from opt-out list
        await supabase
          .from("opt_outs")
          .delete()
          .eq("user_id", profile.id)
          .eq("phone", webhook.from)

        // Update lead status if found (back to responded or previous status)
        await supabase
          .from("leads")
          .update({
            status: "responded",
            last_response_at: new Date().toISOString(),
            last_response_text: webhook.body,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", profile.id)
          .eq("phone", webhook.from)
          .eq("status", "opted_out")
      }

      // Log the inbound message
      await logInboundMessage(supabase, webhook, profile?.id)

      // Send resubscribe confirmation
      const confirmationMessage = COMPLIANCE_MESSAGES.resubscribeConfirmation(businessName)
      return new NextResponse(generateTwiMLResponse(confirmationMessage), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      })
    }

    // 3. Handle HELP keywords
    if (isHelpMessage(webhook.body)) {
      console.log("Help request received from:", webhook.from)

      // Log the inbound message
      await logInboundMessage(supabase, webhook, profile?.id)

      // Send help response
      const helpMessage = COMPLIANCE_MESSAGES.helpResponse(businessName, businessPhone)
      return new NextResponse(generateTwiMLResponse(helpMessage), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      })
    }

    // 4. Normal message - handle with sentiment detection
    if (profile) {
      // Find the lead for this phone
      const { data: lead } = await supabase
        .from("leads")
        .select("id, status, current_step")
        .eq("user_id", profile.id)
        .eq("phone", webhook.from)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single()

      if (lead) {
        // Detect sentiment and booking intent
        const sentiment = detectSentiment(webhook.body)
        const hasBookingIntent = detectBookingIntent(webhook.body)

        // Log the inbound message
        await supabase.from("messages").insert({
          lead_id: lead.id,
          user_id: profile.id,
          direction: "inbound",
          status: "received",
          to_phone: webhook.to,
          from_phone: webhook.from,
          body: webhook.body,
          twilio_sid: webhook.messageSid,
          created_at: new Date().toISOString(),
        })

        // Update lead status to responded and store sentiment
        await supabase
          .from("leads")
          .update({
            status: "responded",
            last_response_at: new Date().toISOString(),
            last_response_text: webhook.body,
            response_sentiment: sentiment,
            next_action_at: null, // Stop automated messages when they respond
            updated_at: new Date().toISOString(),
          })
          .eq("id", lead.id)

        console.log(`Lead ${lead.id} responded with sentiment: ${sentiment}, booking intent: ${hasBookingIntent}`)
      } else {
        // Unknown sender - log but don't create lead
        console.log("Message from unknown number:", webhook.from)
      }
    }

    // Return empty TwiML response (no auto-reply for normal messages)
    return new NextResponse(generateTwiMLResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  } catch (error) {
    console.error("Twilio webhook error:", error)
    
    return new NextResponse(generateTwiMLResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    })
  }
}

/**
 * Helper to log inbound messages for compliance keywords (opt-out, help, etc.)
 */
async function logInboundMessage(
  supabase: ReturnType<typeof createAdminClient>,
  webhook: { from: string; to: string; body: string; messageSid: string },
  userId?: string
) {
  if (!userId) return

  // Find the lead for this phone
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", webhook.from)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (lead) {
    await supabase.from("messages").insert({
      lead_id: lead.id,
      user_id: userId,
      direction: "inbound",
      status: "received",
      to_phone: webhook.to,
      from_phone: webhook.from,
      body: webhook.body,
      twilio_sid: webhook.messageSid,
      created_at: new Date().toISOString(),
    })

    // Update lead's last response
    await supabase
      .from("leads")
      .update({
        last_response_at: new Date().toISOString(),
        last_response_text: webhook.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
  }
}
