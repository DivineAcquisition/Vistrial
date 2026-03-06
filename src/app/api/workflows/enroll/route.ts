// ============================================
// WORKFLOW ENROLLMENT API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { enrollContacts } from '@/lib/services/workflow-service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workflowId, contactIds } = body;

    if (!workflowId) {
      return NextResponse.json({ error: 'workflowId is required' }, { status: 400 });
    }

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'contactIds array is required' }, { status: 400 });
    }

    if (contactIds.length > 1000) {
      return NextResponse.json({ error: 'Maximum 1000 contacts per enrollment request' }, { status: 400 });
    }

    const result = await enrollContacts({
      workflowId,
      organizationId: context.organization.id,
      contactIds,
      skipDuplicates: true,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Enrollment error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrollment failed' },
      { status: 500 }
    );
  }
}
