import twilio from "twilio"

/**
 * Validate Twilio webhook signature
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(authToken, signature, url, params)
}

/**
 * Parse Twilio webhook body from form data
 */
export function parseTwilioWebhook(formData: FormData): {
  from: string
  to: string
  body: string
  messageSid: string
  accountSid: string
  numMedia: number
} {
  return {
    from: formData.get("From") as string,
    to: formData.get("To") as string,
    body: formData.get("Body") as string,
    messageSid: formData.get("MessageSid") as string,
    accountSid: formData.get("AccountSid") as string,
    numMedia: parseInt(formData.get("NumMedia") as string) || 0,
  }
}

/**
 * Generate TwiML response
 */
export function generateTwiMLResponse(message?: string): string {
  if (message) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message}</Message>
</Response>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
}
