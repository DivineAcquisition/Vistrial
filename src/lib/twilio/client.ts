// ============================================
// Twilio SMS client
// ============================================

import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

// Create Twilio client
const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send an SMS message
 * @param to - The recipient phone number (E.164 format)
 * @param body - The message content
 */
export async function sendSMS(to: string, body: string) {
  if (!client) {
    console.warn("Twilio client not configured, skipping SMS");
    return null;
  }

  if (!fromNumber) {
    console.warn("Twilio phone number not configured, skipping SMS");
    return null;
  }

  try {
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to,
    });

    return message;
  } catch (error) {
    console.error("Failed to send SMS:", error);
    throw error;
  }
}

/**
 * Format a phone number to E.164 format
 * Assumes US numbers if no country code is provided
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // If already has country code (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // If 10 digits, assume US number
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Return as-is if already formatted or international
  if (phone.startsWith("+")) {
    return phone;
  }

  return `+${digits}`;
}
