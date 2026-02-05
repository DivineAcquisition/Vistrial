// ============================================
// TELNYX CLIENT
// SMS messaging integration
// ============================================

// Note: Using fetch-based implementation for Next.js edge compatibility
const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

interface TelnyxConfig {
  apiKey: string;
  messagingProfileId?: string;
}

function getConfig(): TelnyxConfig | null {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) {
    console.warn('TELNYX_API_KEY is not set - Telnyx features will be disabled');
    return null;
  }

  return {
    apiKey,
    messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID,
  };
}

/**
 * Get Telnyx client configuration
 */
export function getTelnyxClient(): TelnyxConfig {
  const config = getConfig();
  if (!config) {
    throw new Error('Telnyx is not configured');
  }
  return config;
}

async function telnyxRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const config = getConfig();
  if (!config) throw new Error('Telnyx is not configured');

  const response = await fetch(`${TELNYX_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.errors?.[0]?.detail || `Telnyx API error: ${response.status}`);
  }

  return response.json();
}

// ============================================
// PHONE NUMBER UTILITIES
// ============================================

/**
 * Format phone number to E.164 format
 * E.164: +[country code][number] e.g., +14155551234
 */
export function formatToE164(phone: string, defaultCountryCode: string = '1'): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');

  // Handle empty or invalid input
  if (!digits || digits.length < 10) {
    throw new Error(`Invalid phone number: ${phone}`);
  }

  // If starts with country code (11+ digits for US), keep as is
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // If 10 digits (US number without country code), add +1
  if (digits.length === 10) {
    return `+${defaultCountryCode}${digits}`;
  }

  // If already has + prefix in original, assume it's correct
  if (phone.startsWith('+')) {
    return `+${digits}`;
  }

  // For other lengths, assume it needs the default country code
  return `+${defaultCountryCode}${digits}`;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  try {
    const formatted = formatToE164(phone);
    // Basic validation: E.164 should be between 8-15 digits after the +
    const digits = formatted.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15;
  } catch {
    return false;
  }
}

/**
 * Format phone for display (US format)
 */
export function formatForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // US number formatting
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // Return as-is for international
  return phone;
}

/**
 * Normalize phone number for database comparison
 * Returns just the digits without country code for US numbers
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  // Remove leading 1 for US numbers
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  return digits;
}

// ============================================
// SMS SENDING
// ============================================

export interface SendSmsParams {
  to: string;
  from?: string;
  text: string;
  messagingProfileId?: string;
  webhookUrl?: string;
  metadata?: Record<string, string>;
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  costCents?: number;
}

/**
 * Send an SMS message via Telnyx
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  try {
    const config = getConfig();
    if (!config) throw new Error('Telnyx is not configured');

    // Format phone number
    const toFormatted = formatToE164(params.to);

    // Get messaging profile ID
    const messagingProfileId =
      params.messagingProfileId || config.messagingProfileId;

    if (!messagingProfileId) {
      throw new Error('TELNYX_MESSAGING_PROFILE_ID is not set');
    }

    // Build webhook URL if not provided
    const webhookUrl =
      params.webhookUrl ||
      `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/telnyx`;

    // Build payload
    const payload: Record<string, unknown> = {
      to: toFormatted,
      text: params.text,
      messaging_profile_id: messagingProfileId,
      webhook_url: webhookUrl,
      webhook_failover_url: webhookUrl,
    };

    if (params.from) {
      payload.from = params.from;
    } else if (process.env.TELNYX_PHONE_NUMBER) {
      payload.from = process.env.TELNYX_PHONE_NUMBER;
    }

    // Send the message
    const response = await telnyxRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const message = response.data;

    return {
      success: true,
      messageId: message.id as string,
      // Telnyx SMS cost is approximately $0.004-0.008 per segment
      // We'll get the actual cost from the webhook, estimate for now
      costCents: Math.ceil(params.text.length / 160) * 1, // ~$0.01 per segment estimate
    };
  } catch (error) {
    console.error('Telnyx SMS send error:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    };
  }
}

/**
 * Send SMS with retry logic
 */
export async function sendSmsWithRetry(
  params: SendSmsParams,
  maxRetries: number = 3
): Promise<SendSmsResult> {
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await sendSms(params);

    if (result.success) {
      return result;
    }

    lastError = result.error;

    // Don't retry for certain errors
    if (
      lastError?.includes('Invalid phone number') ||
      lastError?.includes('unsubscribed') ||
      lastError?.includes('blocked')
    ) {
      return result;
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }

  return {
    success: false,
    error: lastError || 'Max retries exceeded',
  };
}

// ============================================
// BATCH SENDING
// ============================================

export interface BatchSmsParams {
  messages: Array<{
    to: string;
    text: string;
    metadata?: Record<string, string>;
  }>;
  from?: string;
  messagingProfileId?: string;
  delayBetweenMs?: number;
}

export interface BatchSmsResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    to: string;
    result: SendSmsResult;
  }>;
}

/**
 * Send batch SMS messages with rate limiting
 */
export async function sendBatchSms(params: BatchSmsParams): Promise<BatchSmsResult> {
  const results: BatchSmsResult['results'] = [];
  const delayMs = params.delayBetweenMs || 100; // Default 100ms between messages

  for (const message of params.messages) {
    const result = await sendSms({
      to: message.to,
      text: message.text,
      from: params.from,
      messagingProfileId: params.messagingProfileId,
      metadata: message.metadata,
    });

    results.push({
      to: message.to,
      result,
    });

    // Rate limiting delay
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    total: params.messages.length,
    successful: results.filter((r) => r.result.success).length,
    failed: results.filter((r) => !r.result.success).length,
    results,
  };
}

// ============================================
// VOICE CALLS
// ============================================

/**
 * Initiate an outbound call
 */
export async function initiateCall({
  to,
  from,
  connectionId,
  answerUrl,
  answerMethod = 'POST',
}: {
  to: string;
  from: string;
  connectionId: string;
  answerUrl: string;
  answerMethod?: 'GET' | 'POST';
}): Promise<{ callControlId: string; callSessionId: string }> {
  const response = await telnyxRequest('/calls', {
    method: 'POST',
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
    status: response.data.to?.[0]?.status || 'unknown',
    sentAt: response.data.sent_at,
    completedAt: response.data.completed_at,
  };
}

/**
 * List phone numbers
 */
export async function listPhoneNumbers(): Promise<
  Array<{
    id: string;
    phoneNumber: string;
    status: string;
  }>
> {
  const response = await telnyxRequest('/phone_numbers');

  return response.data.map((number: any) => ({
    id: number.id,
    phoneNumber: number.phone_number,
    status: number.status,
  }));
}

// ============================================
// OPT-OUT KEYWORDS
// ============================================

export const OPT_OUT_KEYWORDS = [
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
];

export const OPT_IN_KEYWORDS = ['start', 'yes', 'unstop'];

export const HELP_KEYWORDS = ['help', 'info'];

/**
 * Detect intent from inbound message
 */
export function detectMessageIntent(
  text: string
): 'opt_out' | 'opt_in' | 'help' | 'positive' | 'negative' | 'unknown' {
  const normalized = text.toLowerCase().trim();

  // Check for opt-out
  if (OPT_OUT_KEYWORDS.some((kw) => normalized === kw || normalized.startsWith(kw + ' '))) {
    return 'opt_out';
  }

  // Check for opt-in
  if (OPT_IN_KEYWORDS.some((kw) => normalized === kw || normalized.startsWith(kw + ' '))) {
    return 'opt_in';
  }

  // Check for help
  if (HELP_KEYWORDS.some((kw) => normalized === kw || normalized.startsWith(kw + ' '))) {
    return 'help';
  }

  // Check for positive response
  const positivePatterns = [
    /^yes/i,
    /^yeah/i,
    /^yep/i,
    /^sure/i,
    /^ok/i,
    /^okay/i,
    /^interested/i,
    /^i('m| am) interested/i,
    /^sounds good/i,
    /^let('s| us) do it/i,
    /^book/i,
    /^schedule/i,
  ];

  if (positivePatterns.some((pattern) => pattern.test(normalized))) {
    return 'positive';
  }

  // Check for negative response
  const negativePatterns = [
    /^no$/i,
    /^nope/i,
    /^not interested/i,
    /^no thanks/i,
    /^no thank you/i,
    /^remove me/i,
    /^don't contact/i,
    /^wrong number/i,
  ];

  if (negativePatterns.some((pattern) => pattern.test(normalized))) {
    return 'negative';
  }

  return 'unknown';
}

// ============================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================

/**
 * Verify Telnyx webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  timestamp: string | null
): boolean {
  const webhookSecret = process.env.TELNYX_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('TELNYX_WEBHOOK_SECRET not set, skipping verification');
    return true;
  }

  if (!signature || !timestamp) {
    return false;
  }

  try {
    const crypto = require('crypto');
    const signedPayload = `${timestamp}|${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Webhook signature verification error:', error);
    return false;
  }
}

// ============================================
// MESSAGE TEMPLATES
// ============================================

/**
 * Process template variables in message text
 */
export function processMessageTemplate(
  template: string,
  variables: Record<string, string | undefined>
): string {
  let processed = template;

  // Replace {{variable}} patterns
  const variablePattern = /\{\{(\w+)\}\}/g;

  processed = processed.replace(variablePattern, (match, variableName) => {
    const value = variables[variableName];
    return value !== undefined ? value : match;
  });

  return processed;
}

/**
 * Calculate SMS segments (for cost estimation)
 * GSM-7: 160 chars/segment (or 153 for multi-part)
 * Unicode: 70 chars/segment (or 67 for multi-part)
 */
export function calculateSmsSegments(text: string): number {
  // Check if text contains non-GSM characters
  const gsmChars =
    /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑܧ¿a-zäöñüà]*$/;
  const isGsm = gsmChars.test(text);

  const charLimit = isGsm ? 160 : 70;
  const multiPartCharLimit = isGsm ? 153 : 67;

  if (text.length <= charLimit) {
    return 1;
  }

  return Math.ceil(text.length / multiPartCharLimit);
}
