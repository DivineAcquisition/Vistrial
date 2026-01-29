import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    const messageSid = formData.get("MessageSid") as string
    const messageStatus = formData.get("MessageStatus") as string
    const errorCode = formData.get("ErrorCode") as string | null
    const errorMessage = formData.get("ErrorMessage") as string | null

    console.log("Twilio status callback:", { messageSid, messageStatus, errorCode })

    const supabase = createAdminClient()

    // Update message status
    const { error } = await supabase
      .from("messages")
      .update({
        twilio_status: messageStatus,
        status: mapTwilioStatus(messageStatus),
        error_code: errorCode,
        error_message: errorMessage,
        delivered_at: messageStatus === "delivered" ? new Date().toISOString() : undefined,
      })
      .eq("twilio_sid", messageSid)

    if (error) {
      console.error("Error updating message status:", error)
    }

    return new NextResponse("OK", { status: 200 })
  } catch (error) {
    console.error("Status callback error:", error)
    return new NextResponse("OK", { status: 200 })
  }
}

function mapTwilioStatus(twilioStatus: string): "queued" | "sent" | "delivered" | "failed" {
  switch (twilioStatus) {
    case "queued":
    case "accepted":
      return "queued"
    case "sending":
    case "sent":
      return "sent"
    case "delivered":
      return "delivered"
    case "failed":
    case "undelivered":
      return "failed"
    default:
      return "sent"
  }
}
