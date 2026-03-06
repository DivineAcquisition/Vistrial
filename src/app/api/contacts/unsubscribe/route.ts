// @ts-nocheck
// ============================================
// CONTACT UNSUBSCRIBE API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contactId, organizationId } = body;

    if (!contactId || !organizationId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();

    // Update contact status
    const { error } = await admin
      .from('contacts')
      .update({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
      })
      .eq('id', contactId)
      .eq('organization_id', organizationId);

    if (error) {
      throw error;
    }

    // Cancel any active workflow enrollments
    await admin
      .from('workflow_enrollments')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('contact_id', contactId)
      .eq('status', 'active');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Failed to unsubscribe' },
      { status: 500 }
    );
  }
}
