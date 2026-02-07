// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const admin = getSupabaseAdminClient();
    let query = admin.from('booking_requests').select('*, booking_pages(name, slug), contacts(first_name, last_name)').eq('organization_id', context.organization.id).order('created_at', { ascending: false }).limit(limit);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ bookingRequests: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch booking requests' }, { status: 500 });
  }
}
