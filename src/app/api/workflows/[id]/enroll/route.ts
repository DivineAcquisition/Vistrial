// @ts-nocheck
// ============================================
// WORKFLOW ENROLLMENT API
// Enroll contacts in workflow
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import { enrollContacts, enrollContactsByCriteria } from '@/services/workflows.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workflow ownership
    const supabase = await getSupabaseServerClient();
    const { data: workflow } = await supabase
      .from('workflows')
      .select('organization_id, status')
      .eq('id', params.id)
      .single();

    if (!workflow || workflow.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
    }

    if (workflow.status !== 'active') {
      return NextResponse.json(
        { error: 'Workflow must be active to enroll contacts' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { contact_ids, use_criteria, criteria, limit } = body;

    let result;

    if (contact_ids && contact_ids.length > 0) {
      // Enroll specific contacts
      result = await enrollContacts({
        workflowId: params.id,
        contactIds: contact_ids,
        organizationId: context.organization.id,
      });
    } else if (use_criteria) {
      // Enroll by criteria
      result = await enrollContactsByCriteria({
        workflowId: params.id,
        organizationId: context.organization.id,
        criteria,
        limit,
      });
    } else {
      return NextResponse.json(
        { error: 'Must provide contact_ids or use_criteria' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      enrolled: result.enrolled,
      skipped: result.skipped,
      errors: 'errors' in result ? result.errors : [],
    });
  } catch (error) {
    console.error('Enroll contacts error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enroll contacts' },
      { status: 500 }
    );
  }
}
