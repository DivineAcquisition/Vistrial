import twilio from "twilio"

export function createTwilioClient(accountSid: string, authToken: string) {
  return twilio(accountSid, authToken)
}

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured")
  }

  return createTwilioClient(accountSid, authToken)
}
