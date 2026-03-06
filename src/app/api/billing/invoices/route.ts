// ============================================
// INVOICES API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getInvoices, getUpcomingInvoice } from '@/lib/stripe/invoices';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    const { data: orgData } = await admin
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', org.id)
      .single();

    if (!orgData?.stripe_customer_id) {
      return NextResponse.json({ invoices: [], upcoming: null });
    }

    const [invoices, upcoming] = await Promise.all([
      getInvoices(orgData.stripe_customer_id, 24),
      getUpcomingInvoice(orgData.stripe_customer_id),
    ]);

    return NextResponse.json({ invoices, upcoming });
  } catch (error) {
    console.error('Get invoices error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
