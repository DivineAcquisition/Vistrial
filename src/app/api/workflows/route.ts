// @ts-nocheck
// ============================================
// WORKFLOWS API
// Create and list workflows
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getSupabaseAdminClient();

    const { data: workflows, error } = await admin
      .from('workflows')
      .select('*')
      .eq('organization_id', context.organization.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(workflows);
  } catch (error) {
    console.error('Get workflows error:', error);
    return NextResponse.json(
      { error: 'Failed to get workflows' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, steps, settings, enrollment_criteria, status } = body;

    if (!name || !steps || steps.length === 0) {
      return NextResponse.json(
        { error: 'Name and at least one step are required' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();

    const { data: workflow, error } = await admin
      .from('workflows')
      .insert({
        organization_id: context.organization.id,
        name,
        description: description || null,
        steps,
        settings: settings || {},
        enrollment_criteria: enrollment_criteria || {},
        status: status || 'draft',
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(workflow);
  } catch (error) {
    console.error('Create workflow error:', error);
    return NextResponse.json(
      { error: 'Failed to create workflow' },
      { status: 500 }
    );
  }
}
