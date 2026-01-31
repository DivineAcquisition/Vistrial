import { NextRequest, NextResponse } from "next/server"
import { testTwilioConnection } from "@/lib/twilio/send-sms"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountSid, authToken } = body

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { success: false, error: "Account SID and Auth Token are required" },
        { status: 400 }
      )
    }

    // Validate format
    if (!accountSid.startsWith("AC")) {
      return NextResponse.json(
        { success: false, error: "Account SID should start with 'AC'" },
        { status: 400 }
      )
    }

    // Test the connection
    const result = await testTwilioConnection(accountSid, authToken)

    if (result.success) {
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { success: false, error: result.error || "Connection failed" },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("Twilio test error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Connection test failed" },
      { status: 500 }
    )
  }
}
