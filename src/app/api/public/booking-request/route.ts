// @ts-nocheck
// ============================================
// PUBLIC BOOKING REQUEST SUBMISSION
// No auth required - public endpoint
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      bookingPageId, organizationId, serviceId, serviceName,
      selectedOptions, selectedAddOns, estimatedPrice, priceType,
      preferredDate, preferredTime, flexibility,
      customerName, customerPhone, customerEmail, customerAddress, customerNotes,
      source, campaignId, workflowId,
    } = body;

    if (!bookingPageId || !organizationId || !customerName || !customerPhone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    // Check if contact exists
    let contactId: string | null = null;
    const { data: existingContact } = await admin
      .from('contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('phone', customerPhone)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const nameParts = customerName.trim().split(' ');
      const { data: newContact } = await admin
        .from('contacts')
        .insert({
          organization_id: organizationId,
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(' ') || null,
          phone: customerPhone,
          email: customerEmail || null,
          source: source === 'campaign' ? 'campaign' : 'booking_page',
          status: 'active',
        })
        .select()
        .single();
      if (newContact) contactId = newContact.id;
    }

    const { data: bookingRequest, error } = await admin
      .from('booking_requests')
      .insert({
        organization_id: organizationId,
        booking_page_id: bookingPageId,
        contact_id: contactId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        customer_address: customerAddress,
        service_id: serviceId,
        service_name: serviceName,
        selected_options: selectedOptions,
        selected_add_ons: selectedAddOns,
        estimated_price: estimatedPrice,
        price_type: priceType,
        preferred_date: preferredDate,
        preferred_time: preferredTime,
        flexibility,
        customer_notes: customerNotes,
        source,
        campaign_id: campaignId,
        workflow_id: workflowId,
        status: 'new',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, bookingRequestId: bookingRequest.id });
  } catch (error) {
    console.error('Booking request error:', error);
    return NextResponse.json({ error: 'Failed to submit booking request' }, { status: 500 });
  }
}
