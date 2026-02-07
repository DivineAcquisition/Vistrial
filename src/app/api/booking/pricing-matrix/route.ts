// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('pricing_matrices')
      .select('*')
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ pricingMatrices: data });
  } catch (error) {
    console.error('Get pricing matrices error:', error);
    return NextResponse.json({ error: 'Failed to fetch pricing matrices' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { name, businessType, services, globalVariables } = body;
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('pricing_matrices')
      .insert({
        organization_id: context.organization.id,
        name,
        business_type: businessType,
        services: services || [],
        global_variables: globalVariables || [],
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ pricingMatrix: data });
  } catch (error) {
    console.error('Create pricing matrix error:', error);
    return NextResponse.json({ error: 'Failed to create pricing matrix' }, { status: 500 });
  }
}
