// ============================================
// PAYMENT METHODS API
// ============================================

import { NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPaymentMethods } from '@/lib/stripe/invoices';

export async function GET() {
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
      return NextResponse.json({ paymentMethods: [] });
    }

    const paymentMethods = await getPaymentMethods(orgData.stripe_customer_id);
    return NextResponse.json({ paymentMethods });
  } catch (error) {
    console.error('Get payment methods error:', error);
    return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
  }
}
