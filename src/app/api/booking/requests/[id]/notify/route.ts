// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendBookingNotifications } from '@/lib/notifications/booking-notifications';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data: br, error } = await admin.from('booking_requests').select('*, booking_pages(name)').eq('id', params.id).eq('organization_id', context.organization.id).single();
    if (error || !br) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const result = await sendBookingNotifications({ bookingRequestId: br.id, organizationId: context.organization.id, customerName: br.customer_name, customerPhone: br.customer_phone, customerEmail: br.customer_email, serviceName: br.service_name, estimatedPrice: br.estimated_price, priceType: br.price_type, preferredDate: br.preferred_date, preferredTime: br.preferred_time, source: br.source, bookingPageName: br.booking_pages?.name });
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 }); }
}
