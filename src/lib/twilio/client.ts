import twilio from "twilio"

/**
 * Create a Twilio client with provided credentials
 * Server-side only - never expose in client code
 */
export function createTwilioClient(accountSid: string, authToken: string) {
  return twilio(accountSid, authToken)
}

/**
 * Get Twilio client using environment variables
 * For system-level operations
 */
export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured")
  }

  return createTwilioClient(accountSid, authToken)
}

/**
 * Get Twilio client using user's own credentials from their profile
 * For user-specific operations with their own Twilio account
 */
export async function getUserTwilioClient(userId: string) {
  // Dynamic import to avoid circular dependencies
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const supabase = createAdminClient()

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("twilio_account_sid, twilio_auth_token, twilio_phone_number, business_name")
    .eq("id", userId)
    .single()

  if (error || !profile?.twilio_account_sid || !profile?.twilio_auth_token) {
    throw new Error("Twilio credentials not configured for this user")
  }

  return {
    client: twilio(profile.twilio_account_sid, profile.twilio_auth_token),
    phoneNumber: profile.twilio_phone_number,
    businessName: profile.business_name,
    accountSid: profile.twilio_account_sid,
    authToken: profile.twilio_auth_token,
  }
}
