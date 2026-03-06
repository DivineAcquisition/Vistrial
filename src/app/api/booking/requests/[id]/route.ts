// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const admin = getSupabaseAdminClient();
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) updateData.status = body.status;
    if (body.finalPrice !== undefined) updateData.final_price = body.finalPrice;
    if (body.notes !== undefined) updateData.internal_notes = body.notes;
    const { data, error } = await admin.from('booking_requests').update(updateData).eq('id', params.id).eq('organization_id', context.organization.id).select().single();
    if (error) throw error;
    return NextResponse.json({ bookingRequest: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update booking request' }, { status: 500 });
  }
}
