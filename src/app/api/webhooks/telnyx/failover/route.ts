// ============================================
// TELNYX FAILOVER WEBHOOK
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { handleInboundMessage, handleDeliveryStatus } from '@/lib/telnyx/webhook-handlers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('Telnyx FAILOVER webhook received:', JSON.stringify(body, null, 2));

    const eventType = body.data?.event_type || body.event_type;

    switch (eventType) {
      case 'message.received':
        await handleInboundMessage(body);
        break;
      case 'message.sent':
      case 'message.finalized':
        await handleDeliveryStatus(body);
        break;
      default:
        console.log('Unhandled event type:', eventType);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Telnyx failover webhook error:', error);
    return NextResponse.json({ received: true, error: 'Processing failed' });
  }
}
