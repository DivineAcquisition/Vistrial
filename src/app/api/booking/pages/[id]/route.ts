// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('booking_pages').select('*, pricing_matrices(*)').eq('id', params.id).eq('organization_id', context.organization.id).single();
    if (error) throw error;
    return NextResponse.json({ bookingPage: data });
  } catch (error) { return NextResponse.json({ error: 'Failed to fetch booking page' }, { status: 500 }); }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const admin = getSupabaseAdminClient();
    if (body.slug) {
      const { data: existing } = await admin.from('booking_pages').select('id').eq('slug', body.slug).neq('id', params.id).maybeSingle();
      if (existing) return NextResponse.json({ error: 'This URL is already taken' }, { status: 400 });
    }
    const u: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) u.name = body.name;
    if (body.slug !== undefined) u.slug = body.slug;
    if (body.pricingMatrixId !== undefined) u.pricing_matrix_id = body.pricingMatrixId;
    if (body.settings !== undefined) u.settings = body.settings;
    if (body.customization !== undefined) u.customization = body.customization;
    if (body.active !== undefined) u.active = body.active;
    const { data, error } = await admin.from('booking_pages').update(u).eq('id', params.id).eq('organization_id', context.organization.id).select().single();
    if (error) throw error;
    return NextResponse.json({ bookingPage: data });
  } catch (error) { return NextResponse.json({ error: 'Failed to update booking page' }, { status: 500 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from('booking_pages').delete().eq('id', params.id).eq('organization_id', context.organization.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: 'Failed to delete booking page' }, { status: 500 }); }
}
