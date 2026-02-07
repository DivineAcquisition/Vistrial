// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendBookingNotifications } from '@/lib/notifications/booking-notifications';
import { stopCampaignsOnBooking, getBookingAttribution } from '@/lib/workflows/booking-integration';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingPageId, organizationId, serviceId, serviceName, selectedOptions, selectedAddOns, estimatedPrice, priceType, preferredDate, preferredTime, flexibility, customerName, customerPhone, customerEmail, customerAddress, customerNotes, source, campaignId, workflowId } = body;

    if (!bookingPageId || !organizationId || !customerName || !customerPhone) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    let contactId: string | null = null;
    let isNewContact = false;

    const { data: existing } = await admin.from('contacts').select('id').eq('organization_id', organizationId).eq('phone', customerPhone).maybeSingle();
    if (existing) {
      contactId = existing.id;
      await admin.from('contacts').update({ email: customerEmail || undefined, status: 'active', last_contacted_at: new Date().toISOString() }).eq('id', contactId);
    } else {
      isNewContact = true;
      const parts = customerName.trim().split(' ');
      const { data: nc } = await admin.from('contacts').insert({ organization_id: organizationId, first_name: parts[0], last_name: parts.slice(1).join(' ') || null, phone: customerPhone, email: customerEmail || null, source: source === 'campaign' ? 'campaign' : 'booking_page', status: 'active' }).select().single();
      if (nc) contactId = nc.id;
    }

    let attrWorkflow = workflowId;
    if (!attrWorkflow && contactId) {
      const attr = await getBookingAttribution(contactId, organizationId);
      if (attr) attrWorkflow = attr.workflowId;
    }

    const { data: bp } = await admin.from('booking_pages').select('name').eq('id', bookingPageId).maybeSingle();

    const { data: br, error } = await admin.from('booking_requests').insert({
      organization_id: organizationId, booking_page_id: bookingPageId, contact_id: contactId,
      customer_name: customerName, customer_phone: customerPhone, customer_email: customerEmail, customer_address: customerAddress,
      service_id: serviceId, service_name: serviceName, selected_options: selectedOptions, selected_add_ons: selectedAddOns,
      estimated_price: estimatedPrice, price_type: priceType, preferred_date: preferredDate, preferred_time: preferredTime, flexibility,
      customer_notes: customerNotes, source: attrWorkflow ? 'campaign' : source, campaign_id: campaignId, workflow_id: attrWorkflow, status: 'new',
    }).select().single();

    if (error) throw error;

    // Async: send notifications
    sendBookingNotifications({ bookingRequestId: br.id, organizationId, customerName, customerPhone, customerEmail, serviceName, estimatedPrice, priceType, preferredDate, preferredTime, source: attrWorkflow ? 'campaign' : source, bookingPageName: bp?.name }).catch(console.error);

    // Async: stop active campaigns
    if (contactId) {
      stopCampaignsOnBooking({ contactId, organizationId, bookingRequestId: br.id, reason: `Customer booked ${serviceName} via ${bp?.name || 'booking page'}` }).catch(console.error);
    }

    return NextResponse.json({ success: true, bookingRequestId: br.id, contactId, isNewContact });
  } catch (error) { console.error('Booking request error:', error); return NextResponse.json({ error: 'Failed to submit booking request' }, { status: 500 }); }
}
