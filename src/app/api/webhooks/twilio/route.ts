import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { parseTwilioWebhook, generateTwiMLResponse } from "@/lib/twilio/validate-webhook"

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

    // Call the database function to handle inbound message
    const { data, error } = await supabase.rpc("handle_inbound_message", {
      p_from_phone: webhook.from,
      p_to_phone: webhook.to,
      p_body: webhook.body,
      p_twilio_sid: webhook.messageSid,
    })

    if (error) {
      console.error("Error handling inbound message:", error)
    } else {
      console.log("Inbound message handled, message_id:", data)
    }

    // Return empty TwiML response (no auto-reply)
    return new NextResponse(generateTwiMLResponse(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    })
  } catch (error) {
    console.error("Twilio webhook error:", error)
    
    return new NextResponse(generateTwiMLResponse(), {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    })
  }
}
