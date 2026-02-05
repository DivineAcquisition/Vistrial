// @ts-nocheck
// ============================================
// BULK CONTACT OPERATIONS API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import {
  bulkAddTags,
  bulkRemoveTags,
  bulkUpdateStatus,
  bulkDeleteContacts,
} from '@/services/contacts.service';
import { enrollContacts } from '@/services/workflows.service';

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, contact_ids, tags, status, workflow_id } = body;

    if (!action || !contact_ids || contact_ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: action, contact_ids' },
        { status: 400 }
      );
    }

    // Verify all contacts belong to this organization
    const supabase = await getSupabaseServerClient();
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', context.organization.id)
      .in('id', contact_ids);

    const validContactIds = (contacts || []).map((c) => c.id);

    if (validContactIds.length === 0) {
      return NextResponse.json({ error: 'No valid contacts found' }, { status: 400 });
    }

    let result: { affected: number; [key: string]: any } = { affected: 0 };

    switch (action) {
      case 'add_tags':
        if (!tags || tags.length === 0) {
          return NextResponse.json(
            { error: 'Tags required for add_tags action' },
            { status: 400 }
          );
        }
        result.affected = await bulkAddTags(validContactIds, tags);
        break;

      case 'remove_tags':
        if (!tags || tags.length === 0) {
          return NextResponse.json(
            { error: 'Tags required for remove_tags action' },
            { status: 400 }
          );
        }
        result.affected = await bulkRemoveTags(validContactIds, tags);
        break;

      case 'update_status':
        if (!status) {
          return NextResponse.json(
            { error: 'Status required for update_status action' },
            { status: 400 }
          );
        }
        result.affected = await bulkUpdateStatus(validContactIds, status);
        break;

      case 'delete':
        result.affected = await bulkDeleteContacts(validContactIds);
        break;

      case 'enroll_workflow':
        if (!workflow_id) {
          return NextResponse.json(
            { error: 'Workflow ID required for enroll_workflow action' },
            { status: 400 }
          );
        }
        const enrollResult = await enrollContacts({
          workflowId: workflow_id,
          contactIds: validContactIds,
          organizationId: context.organization.id,
        });
        result = {
          affected: enrollResult.enrolled,
          enrolled: enrollResult.enrolled,
          skipped: enrollResult.skipped,
          errors: enrollResult.errors,
        };
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Bulk operation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk operation failed' },
      { status: 500 }
    );
  }
}
