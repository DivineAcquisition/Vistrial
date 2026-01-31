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
 * For Next.js API routes - extracts and validates webhook
 */
export async function validateTwilioWebhook(
  request: Request,
  authToken: string
): Promise<{ valid: boolean; params?: Record<string, string> }> {
  const signature = request.headers.get("x-twilio-signature")

  if (!signature) {
    return { valid: false }
  }

  const url = request.url
  const formData = await request.formData()
  const params: Record<string, string> = {}

  formData.forEach((value, key) => {
    params[key] = value.toString()
  })

  const valid = validateTwilioSignature(authToken, signature, url, params)

  return { valid, params }
}

/**
 * Generate TwiML response
 */
export function generateTwiMLResponse(message?: string): string {
  if (message) {
    // Escape XML special characters in the message
    const escapedMessage = message
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapedMessage}</Message>
</Response>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
}
