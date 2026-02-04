/**
 * Telnyx Client
 * 
 * Client for Telnyx SMS and Voice operations:
 * - Send SMS messages
 * - Initiate outbound calls
 * - Handle webhooks
 * - Manage phone numbers
 * 
 * Documentation: https://developers.telnyx.com/docs/api/v2
 */

// Note: Using fetch-based implementation for Next.js edge compatibility
const TELNYX_API_BASE = "https://api.telnyx.com/v2";

interface TelnyxConfig {
  apiKey: string;
  messagingProfileId?: string;
}

function getConfig(): TelnyxConfig | null {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    console.warn("TELNYX_API_KEY is not set - Telnyx features will be disabled");
    return null;
  }
  
  return {
    apiKey,
    messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID,
  };
}

async function telnyxRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const config = getConfig();
  if (!config) throw new Error("Telnyx is not configured");

  const response = await fetch(`${TELNYX_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.errors?.[0]?.detail || `Telnyx API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Send an SMS message
 */
export async function sendSms({
  to,
  from,
  text,
  messagingProfileId,
  webhookUrl,
}: {
  to: string;
  from?: string;
  text: string;
  messagingProfileId?: string;
  webhookUrl?: string;
}): Promise<{ messageId: string; status: string }> {
  const config = getConfig();
  if (!config) throw new Error("Telnyx is not configured");

  const profileId = messagingProfileId || config.messagingProfileId;
  
  const payload: any = {
    to,
    text,
    messaging_profile_id: profileId,
  };

  if (from) {
    payload.from = from;
  }

  if (webhookUrl) {
    payload.webhook_url = webhookUrl;
  }

  const response = await telnyxRequest("/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    messageId: response.data.id,
    status: response.data.to?.[0]?.status || "queued",
  };
}

/**
 * Initiate an outbound call
 */
export async function initiateCall({
  to,
  from,
  connectionId,
  answerUrl,
  answerMethod = "POST",
}: {
  to: string;
  from: string;
  connectionId: string;
  answerUrl: string;
  answerMethod?: "GET" | "POST";
}): Promise<{ callControlId: string; callSessionId: string }> {
  const response = await telnyxRequest("/calls", {
    method: "POST",
    body: JSON.stringify({
      to,
      from,
      connection_id: connectionId,
      webhook_url: answerUrl,
      webhook_url_method: answerMethod,
    }),
  });

  return {
    callControlId: response.data.call_control_id,
    callSessionId: response.data.call_session_id,
  };
}

/**
 * Get message details
 */
export async function getMessageStatus(messageId: string): Promise<{
  id: string;
  status: string;
  sentAt: string;
  completedAt?: string;
}> {
  const response = await telnyxRequest(`/messages/${messageId}`);

  return {
    id: response.data.id,
    status: response.data.to?.[0]?.status || "unknown",
    sentAt: response.data.sent_at,
    completedAt: response.data.completed_at,
  };
}

/**
 * List phone numbers
 */
export async function listPhoneNumbers(): Promise<Array<{
  id: string;
  phoneNumber: string;
  status: string;
}>> {
  const response = await telnyxRequest("/phone_numbers");

  return response.data.map((number: any) => ({
    id: number.id,
    phoneNumber: number.phone_number,
    status: number.status,
  }));
}

/**
 * Verify webhook signature (simplified - implement full HMAC verification in production)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  timestamp: string | null
): boolean {
  // TODO: Implement proper ED25519 signature verification
  // See: https://developers.telnyx.com/docs/api/v2/overview#webhook-signing
  
  if (!signature || !timestamp) {
    return false;
  }

  // For now, just check that the signature and timestamp exist
  // In production, implement proper cryptographic verification
  return true;
}

/**
 * Format phone number to E.164
 */
export function formatToE164(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  
  // If already has country code (11 digits for US)
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  
  // Assume US number if 10 digits
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // Return with + prefix if not already formatted
  return digits.startsWith("+") ? phone : `+${digits}`;
}
