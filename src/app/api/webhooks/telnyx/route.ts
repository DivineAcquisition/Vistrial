// @ts-nocheck
// ============================================
// TELNYX WEBHOOK HANDLER
// Processes delivery receipts and inbound messages
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/telnyx';
import {
  processInboundMessage,
  updateDeliveryStatus,
} from '@/services/messaging.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    // Verify webhook signature if secret is configured
    const signature = request.headers.get('telnyx-signature-ed25519') || '';
    const timestamp = request.headers.get('telnyx-timestamp') || '';

    if (process.env.TELNYX_WEBHOOK_SECRET) {
      if (!verifyWebhookSignature(body, signature, timestamp)) {
        console.error('Invalid Telnyx webhook signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(body);
    const eventType = payload.data?.event_type;

    console.log('Telnyx webhook received:', eventType);

    switch (eventType) {
      case 'message.sent':
        await handleMessageSent(payload.data.payload);
        break;

      case 'message.finalized':
        await handleMessageFinalized(payload.data.payload);
        break;

      case 'message.received':
        await handleMessageReceived(payload.data.payload);
        break;

      case 'call.initiated':
      case 'call.answered':
      case 'call.hangup':
        // Handle voice call events
        // TODO: Implement voice call tracking
        console.log('Voice call event:', eventType, payload.data.payload);
        break;

      default:
        console.log('Unhandled Telnyx event type:', eventType);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Telnyx webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle message.sent event
 */
async function handleMessageSent(payload: any) {
  const messageId = payload.id;

  await updateDeliveryStatus({
    providerMessageId: messageId,
    status: 'sent',
  });
}

/**
 * Handle message.finalized event (delivery receipt)
 */
async function handleMessageFinalized(payload: any) {
  const messageId = payload.id;
  const toResults = payload.to || [];

  // Get the delivery status from the first recipient
  const firstRecipient = toResults[0];

  if (!firstRecipient) {
    console.warn('No recipient in finalized message:', messageId);
    return;
  }

  const status = firstRecipient.status;

  // Map Telnyx statuses to our statuses
  let mappedStatus: 'delivered' | 'sent' | 'failed' | 'undelivered';

  switch (status) {
    case 'delivered':
    case 'delivery_confirmed':
      mappedStatus = 'delivered';
      break;
    case 'sent':
    case 'sending':
      mappedStatus = 'sent';
      break;
    case 'delivery_failed':
    case 'sending_failed':
      mappedStatus = 'failed';
      break;
    case 'delivery_unconfirmed':
      mappedStatus = 'undelivered';
      break;
    default:
      mappedStatus = 'sent';
  }

  await updateDeliveryStatus({
    providerMessageId: messageId,
    status: mappedStatus,
    errorCode: firstRecipient.error_code,
    errorMessage: firstRecipient.error_message,
  });
}

/**
 * Handle message.received event (inbound SMS)
 */
async function handleMessageReceived(payload: any) {
  const from = payload.from?.phone_number;
  const to = payload.to?.[0]?.phone_number;
  const text = payload.text;
  const messageId = payload.id;

  if (!from || !to || !text) {
    console.warn('Incomplete inbound message:', payload);
    return;
  }

  await processInboundMessage({
    from,
    to,
    text,
    providerMessageId: messageId,
  });
}
