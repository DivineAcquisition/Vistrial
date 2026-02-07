// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('booking_pages').select('*, pricing_matrices(name, business_type)').eq('organization_id', context.organization.id).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ bookingPages: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch booking pages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { name, slug, pricingMatrixId, settings, customization } = body;
    const admin = getSupabaseAdminClient();

    const { data: existing } = await admin.from('booking_pages').select('id').eq('slug', slug).maybeSingle();
    if (existing) return NextResponse.json({ error: 'This URL is already taken.' }, { status: 400 });

    const defaultSettings = {
      requirePhone: true, requireEmail: false, requireAddress: false,
      showPricing: true, showEstimate: true, allowDateSelection: true, allowTimeSelection: false,
      leadTime: 24, maxAdvance: 30,
      availableDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      availableHours: { start: '09:00', end: '17:00' },
      confirmationMessage: "Thanks! We'll be in touch shortly.",
      notificationEmail: context.user?.email || '', notificationSms: true,
    };
    const defaultCustomization = {
      primaryColor: '#5347d1',
      headline: `Book with ${context.organization.name}`,
      subheadline: 'Get an instant quote and schedule your service',
      ctaText: 'Request Booking',
      thankYouMessage: "You're all set! We'll contact you within 24 hours to confirm.",
    };

    const { data, error } = await admin.from('booking_pages').insert({
      organization_id: context.organization.id, name, slug,
      pricing_matrix_id: pricingMatrixId,
      settings: { ...defaultSettings, ...settings },
      customization: { ...defaultCustomization, ...customization },
      active: true,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ bookingPage: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create booking page' }, { status: 500 });
  }
}
