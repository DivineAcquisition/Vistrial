// ============================================
// BUSINESS SETTINGS API - Saves to DB
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;
    const { data, error } = await admin.from('organizations').select('*').eq('id', org.id).single();
    if (error) throw error;
    return NextResponse.json({ organization: data });
  } catch (error) {
    console.error('Get business error:', error);
    return NextResponse.json({ error: 'Failed to fetch business settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    const fields: Record<string, string> = {
      name: 'name', phone: 'phone', email: 'email', website: 'website',
      address: 'address', city: 'city', state: 'state', zip: 'zip',
      logoUrl: 'logo_url', businessType: 'business_type',
      businessDescription: 'business_description', serviceArea: 'service_area',
      foundedYear: 'founded_year', employeeCount: 'employee_count',
    };

    for (const [key, col] of Object.entries(fields)) {
      if (body[key] !== undefined) updateData[col] = body[key];
    }

    const { data, error } = await admin
      .from('organizations')
      .update(updateData)
      .eq('id', org.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ organization: data, message: 'Business settings updated' });
  } catch (error) {
    console.error('Update business error:', error);
    return NextResponse.json({ error: 'Failed to update business settings' }, { status: 500 });
  }
}
