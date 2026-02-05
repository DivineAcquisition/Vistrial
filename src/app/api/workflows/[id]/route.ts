// @ts-nocheck
// ============================================
// SINGLE WORKFLOW API
// Get, update, delete workflow
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import {
  updateWorkflow,
  activateWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  archiveWorkflow,
  getWorkflowWithStats,
} from '@/services/workflows.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workflow = await getWorkflowWithStats(params.id);

    // Verify ownership
    if (workflow.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error('Get workflow error:', error);
    return NextResponse.json({ error: 'Failed to get workflow' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const supabase = await getSupabaseServerClient();
    const { data: existing } = await supabase
      .from('workflows')
      .select('organization_id')
      .eq('id', params.id)
      .single();

    if (!existing || existing.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { action, ...updates } = body;

    let workflow;

    // Handle action-based updates
    if (action) {
      switch (action) {
        case 'activate':
          workflow = await activateWorkflow(params.id);
          break;
        case 'pause':
          workflow = await pauseWorkflow(params.id);
          break;
        case 'resume':
          workflow = await resumeWorkflow(params.id);
          break;
        case 'archive':
          workflow = await archiveWorkflow(params.id);
          break;
        default:
          return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }
    } else {
      // Regular update
      workflow = await updateWorkflow(params.id, updates);
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error('Update workflow error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update workflow' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const supabase = await getSupabaseServerClient();
    const { data: existing } = await supabase
      .from('workflows')
      .select('organization_id')
      .eq('id', params.id)
      .single();

    if (!existing || existing.organization_id !== context.organization.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await archiveWorkflow(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete workflow error:', error);
    return NextResponse.json({ error: 'Failed to delete workflow' }, { status: 500 });
  }
}
