// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (!body.type || !body.content) return NextResponse.json({ error: 'Type and content required' }, { status: 400 });
    const admin = getSupabaseAdminClient();
    const { data: br } = await admin.from('booking_requests').select('id').eq('id', params.id).eq('organization_id', context.organization.id).single();
    if (!br) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const { data: activity, error } = await admin.from('booking_request_activities').insert({ booking_request_id: params.id, organization_id: context.organization.id, user_id: context.user?.id, type: body.type, content: body.content }).select().single();
    if (error) throw error;
    return NextResponse.json({ activity });
  } catch (error) { return NextResponse.json({ error: 'Failed to add activity' }, { status: 500 }); }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('booking_request_activities').select('*').eq('booking_request_id', params.id).eq('organization_id', context.organization.id).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ activities: data });
  } catch (error) { return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 }); }
}
