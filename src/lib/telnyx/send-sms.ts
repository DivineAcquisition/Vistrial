// ============================================
// TELNYX SMS SENDING
// ============================================

import { telnyxApiClient } from './api-client';

const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vistrial.io';

export interface SendSMSParams {
  to: string;
  from: string;
  text: string;
  messagingProfileId?: string;
  webhookUrl?: string;
  webhookFailoverUrl?: string;
  mediaUrls?: string[];
}

export interface SendSMSResult {
  success: boolean;
  messageId?: string;
  to?: string;
  from?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Format phone number to E.164 format
 */
export function formatE164(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return `+${cleaned}`;
  }

  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  return `+${cleaned}`;
}

/**
 * Send a single SMS message via Telnyx
 */
export async function sendSMS(params: SendSMSParams): Promise<SendSMSResult> {
  const {
    to,
    from,
    text,
    messagingProfileId = TELNYX_MESSAGING_PROFILE_ID,
    webhookUrl = `${APP_URL}/api/webhooks/telnyx`,
    webhookFailoverUrl = `${APP_URL}/api/webhooks/telnyx/failover`,
    mediaUrls,
  } = params;

  const formattedTo = formatE164(to);
  const formattedFrom = formatE164(from);

  if (!formattedTo || formattedTo.length < 10) {
    return { success: false, error: 'Invalid recipient phone number', errorCode: 'INVALID_TO' };
  }

  if (!formattedFrom || formattedFrom.length < 10) {
    return { success: false, error: 'Invalid sender phone number', errorCode: 'INVALID_FROM' };
  }

  try {
    const payload: any = {
      from: formattedFrom,
      to: formattedTo,
      text,
      messaging_profile_id: messagingProfileId,
      webhook_url: webhookUrl,
      webhook_failover_url: webhookFailoverUrl,
    };

    if (mediaUrls && mediaUrls.length > 0) {
      payload.media_urls = mediaUrls;
    }

    const response = await telnyxApiClient.post<any>('/messages', payload);

    return {
      success: true,
      messageId: response.data.id,
      to: response.data.to?.[0]?.phone_number || formattedTo,
      from: response.data.from?.phone_number || formattedFrom,
    };
  } catch (error) {
    console.error('Telnyx SMS error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to send SMS';

    let errorCode = 'SEND_FAILED';
    if (errorMessage.includes('rate limit')) errorCode = 'RATE_LIMITED';
    else if (errorMessage.includes('insufficient')) errorCode = 'INSUFFICIENT_FUNDS';
    else if (errorMessage.includes('not registered') || errorMessage.includes('10DLC')) errorCode = 'NOT_REGISTERED';

    return { success: false, error: errorMessage, errorCode };
  }
}

/**
 * Send SMS to multiple recipients (batch)
 */
export async function sendBulkSMS(
  recipients: string[],
  from: string,
  text: string,
  options?: { delayBetween?: number; onProgress?: (sent: number, total: number) => void }
): Promise<{ successful: SendSMSResult[]; failed: SendSMSResult[] }> {
  const { delayBetween = 100, onProgress } = options || {};

  const successful: SendSMSResult[] = [];
  const failed: SendSMSResult[] = [];

  for (let i = 0; i < recipients.length; i++) {
    const result = await sendSMS({ to: recipients[i], from, text });

    if (result.success) {
      successful.push(result);
    } else {
      failed.push({ ...result, to: recipients[i] });
    }

    onProgress?.(i + 1, recipients.length);

    if (i < recipients.length - 1 && delayBetween > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBetween));
    }
  }

  return { successful, failed };
}
