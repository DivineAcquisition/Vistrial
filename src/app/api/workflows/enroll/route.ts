// ============================================
// BULK ENROLL CONTACTS INTO WORKFLOW
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workflowId, contactIds } = body;

    if (!workflowId || !contactIds?.length) {
      return NextResponse.json({ error: 'Workflow ID and contact IDs required' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const org = context.organization as Record<string, any>;

    // Verify workflow ownership and status
    const { data: workflow, error: wfError } = await admin
      .from('workflows')
      .select('id, status, organization_id, name')
      .eq('id', workflowId)
      .eq('organization_id', org.id)
      .single();

    if (wfError || !workflow) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    let enrolled = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const contactId of contactIds) {
      try {
        // Check if already enrolled
        const { data: existing } = await admin
          .from('workflow_enrollments')
          .select('id')
          .eq('workflow_id', workflowId)
          .eq('contact_id', contactId)
          .in('status', ['active', 'completed'])
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        // Check contact status
        const { data: contact } = await admin
          .from('contacts')
          .select('status, phone')
          .eq('id', contactId)
          .eq('organization_id', org.id)
          .single();

        if (!contact || contact.status === 'unsubscribed' || contact.status === 'do_not_contact') {
          skipped++;
          continue;
        }

        // Create enrollment
        const { error: enrollError } = await admin
          .from('workflow_enrollments')
          .insert({
            workflow_id: workflowId,
            contact_id: contactId,
            organization_id: org.id,
            status: 'active',
            current_step_index: 0,
          });

        if (enrollError) {
          errors.push(`Contact ${contactId}: ${enrollError.message}`);
        } else {
          enrolled++;
        }
      } catch (err) {
        errors.push(`Contact ${contactId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // If workflow was draft, activate it
    if (workflow.status === 'draft' && enrolled > 0) {
      await admin
        .from('workflows')
        .update({ status: 'active', activated_at: new Date().toISOString() })
        .eq('id', workflowId);
    }

    return NextResponse.json({ enrolled, skipped, errors });
  } catch (error) {
    console.error('Enroll error:', error);
    return NextResponse.json({ error: 'Failed to enroll contacts' }, { status: 500 });
  }
}
