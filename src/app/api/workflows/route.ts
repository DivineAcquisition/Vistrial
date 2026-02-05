// @ts-nocheck
// ============================================
// WORKFLOWS API
// List and create workflows
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';
import {
  createWorkflowFromTemplate,
  createCustomWorkflow,
} from '@/services/workflows.service';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getSupabaseServerClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const category = searchParams.get('category');

    let query = supabase
      .from('workflows')
      .select('*')
      .eq('organization_id', context.organization.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data: workflows, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ workflows });
  } catch (error) {
    console.error('List workflows error:', error);
    return NextResponse.json({ error: 'Failed to list workflows' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { template_id, name, description, category, steps, settings, enrollment_criteria } =
      body;

    let workflow;

    if (template_id) {
      // Create from template
      workflow = await createWorkflowFromTemplate({
        organizationId: context.organization.id,
        templateId: template_id,
        name,
        settings,
        enrollmentCriteria: enrollment_criteria,
      });
    } else {
      // Create custom workflow
      if (!name || !category || !steps) {
        return NextResponse.json(
          { error: 'Missing required fields: name, category, steps' },
          { status: 400 }
        );
      }

      workflow = await createCustomWorkflow({
        organizationId: context.organization.id,
        name,
        description,
        category,
        steps,
        settings,
        enrollmentCriteria: enrollment_criteria,
      });
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error('Create workflow error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create workflow' },
      { status: 500 }
    );
  }
}
