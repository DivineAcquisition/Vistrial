// @ts-nocheck
// ============================================
// TELNYX A2P WEBHOOK HANDLER
// Automates: brand verified → create campaign → campaign approved → buy number → assign → active
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createCampaign, searchNumbers, purchaseNumber, assignNumberToCampaign } from '@/lib/telnyx/a2p-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = body?.data?.event_type || body?.event_type;
    const payload = body?.data?.payload || body?.data || body;
    const admin = getSupabaseAdminClient();

    console.log(`[Telnyx A2P Webhook] Event: ${eventType}`, JSON.stringify(payload).slice(0, 500));

    // ========================================
    // BRAND VERIFIED → auto-submit campaign
    // ========================================
    if (eventType === '10dlc.brand.status_update' || eventType === 'brand.status_update') {
      const brandId = payload.brandId || payload.brand_id;
      const status = payload.identityStatus || payload.status;

      if (!brandId) return NextResponse.json({ received: true });

      const { data: reg } = await admin.from('messaging_registrations').select('*').eq('telnyx_brand_id', brandId).maybeSingle();
      if (!reg) { console.log('No registration found for brand:', brandId); return NextResponse.json({ received: true }); }

      if (status === 'VERIFIED' || status === 'verified') {
        await admin.from('messaging_registrations').update({ brand_status: 'verified', brand_verified_at: new Date().toISOString() }).eq('id', reg.id);

        // Auto-submit campaign
        try {
          const campaignResult = await createCampaign({
            brandId,
            businessName: reg.legal_business_name,
            businessPhone: reg.business_phone,
            businessEmail: reg.business_email,
          });

          await admin.from('messaging_registrations').update({
            telnyx_campaign_id: campaignResult.campaignId,
            campaign_status: 'pending',
            campaign_submitted_at: new Date().toISOString(),
          }).eq('id', reg.id);

          console.log(`[A2P] Campaign submitted for ${reg.legal_business_name}: ${campaignResult.campaignId}`);
        } catch (err) {
          console.error('[A2P] Failed to create campaign:', err);
          await admin.from('messaging_registrations').update({ campaign_status: 'failed', failure_reason: err instanceof Error ? err.message : 'Campaign creation failed' }).eq('id', reg.id);
        }
      } else if (status === 'FAILED' || status === 'UNVERIFIED' || status === 'failed') {
        await admin.from('messaging_registrations').update({
          brand_status: 'failed',
          overall_status: 'failed',
          failure_reason: payload.failureReason || payload.failure_reason || 'Brand verification failed. Check that your business name matches IRS records exactly.',
        }).eq('id', reg.id);
      }
    }

    // ========================================
    // CAMPAIGN APPROVED → auto-buy number + assign
    // ========================================
    if (eventType === '10dlc.campaign.status_update' || eventType === 'campaign.status_update') {
      const campaignId = payload.campaignId || payload.campaign_id;
      const status = payload.status || payload.campaignStatus;

      if (!campaignId) return NextResponse.json({ received: true });

      const { data: reg } = await admin.from('messaging_registrations').select('*').eq('telnyx_campaign_id', campaignId).maybeSingle();
      if (!reg) return NextResponse.json({ received: true });

      if (status === 'APPROVED' || status === 'approved') {
        await admin.from('messaging_registrations').update({ campaign_status: 'approved', campaign_approved_at: new Date().toISOString() }).eq('id', reg.id);

        // Auto-purchase number and assign to campaign
        try {
          const numbers = await searchNumbers(reg.state, 3);
          if (numbers.length === 0) throw new Error('No available numbers in ' + reg.state);

          const selectedNumber = numbers[0].phoneNumber;
          await purchaseNumber(selectedNumber, reg.telnyx_messaging_profile_id);
          await assignNumberToCampaign(selectedNumber, campaignId);

          await admin.from('messaging_registrations').update({
            telnyx_phone_number: selectedNumber,
            number_status: 'active',
            overall_status: 'active',
            activated_at: new Date().toISOString(),
          }).eq('id', reg.id);

          console.log(`[A2P] Messaging ACTIVE for ${reg.legal_business_name}: ${selectedNumber}`);
        } catch (err) {
          console.error('[A2P] Failed to purchase/assign number:', err);
          await admin.from('messaging_registrations').update({ number_status: 'failed', failure_reason: err instanceof Error ? err.message : 'Number purchase failed' }).eq('id', reg.id);
        }
      } else if (status === 'DECLINED' || status === 'declined') {
        await admin.from('messaging_registrations').update({
          campaign_status: 'declined',
          overall_status: 'failed',
          failure_reason: payload.declineReason || 'Campaign declined by carriers. Sample messages may need adjustment.',
        }).eq('id', reg.id);
      }
    }

    // ========================================
    // MESSAGE STATUS UPDATES → update message_log
    // ========================================
    if (eventType === 'message.sent' || eventType === 'message.finalized') {
      const msgId = payload.id;
      const status = payload.to?.[0]?.status || payload.status;
      if (msgId) {
        const update: Record<string, any> = {};
        if (status === 'delivered' || status === 'sent') {
          update.status = status;
          if (status === 'delivered') update.delivered_at = new Date().toISOString();
        } else if (status === 'sending_failed' || status === 'delivery_failed') {
          update.status = 'failed';
          update.failed_at = new Date().toISOString();
          update.error_message = payload.errors?.[0]?.detail || 'Delivery failed';
        }
        if (Object.keys(update).length > 0) {
          await admin.from('message_log').update(update).eq('telnyx_message_id', msgId);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Telnyx A2P Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
