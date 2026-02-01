import { createTwilioClient } from "./client"

export interface SendSMSParams {
  to: string
  from: string
  body: string
  accountSid: string
  authToken: string
  statusCallback?: string
}

export interface SendSMSResult {
  success: boolean
  messageSid?: string
  status?: string
  error?: string
  errorCode?: string
}

export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
  const { to, from, body, accountSid, authToken, statusCallback } = params

  try {
    const client = createTwilioClient(accountSid, authToken)

    const message = await client.messages.create({
      to,
      from,
      body,
      statusCallback,
    })

    return {
      success: true,
      messageSid: message.sid,
      status: message.status,
    }
  } catch (error: any) {
    console.error("Twilio SMS error:", error)

    return {
      success: false,
      error: error.message || "Failed to send SMS",
      errorCode: error.code,
    }
  }
}

export async function testTwilioConnection(
  accountSid: string,
  authToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = createTwilioClient(accountSid, authToken)
    
    // Try to fetch account info to verify credentials
    await client.api.accounts(accountSid).fetch()

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to connect to Twilio",
    }
  }
}
