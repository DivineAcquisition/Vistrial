// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.from('pricing_matrices').select('*').eq('id', params.id).eq('organization_id', context.organization.id).single();
    if (error) throw error;
    return NextResponse.json({ pricingMatrix: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch pricing matrix' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const admin = getSupabaseAdminClient();
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.services !== undefined) updateData.services = body.services;
    if (body.globalVariables !== undefined) updateData.global_variables = body.globalVariables;
    const { data, error } = await admin.from('pricing_matrices').update(updateData).eq('id', params.id).eq('organization_id', context.organization.id).select().single();
    if (error) throw error;
    return NextResponse.json({ pricingMatrix: data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update pricing matrix' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { error } = await admin.from('pricing_matrices').delete().eq('id', params.id).eq('organization_id', context.organization.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete pricing matrix' }, { status: 500 });
  }
}
