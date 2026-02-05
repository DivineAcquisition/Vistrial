// @ts-nocheck
// ============================================
// WORKFLOW TEMPLATES API
// List available templates
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();

    if (!context?.user || !context.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getSupabaseServerClient();
    const { searchParams } = new URL(request.url);

    const category = searchParams.get('category');
    const businessType = context.organization.business_type;

    let query = supabase
      .from('workflow_templates')
      .select('*')
      .eq('is_active', true)
      .contains('business_types', [businessType])
      .order('times_used', { ascending: false });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: templates, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('List templates error:', error);
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }
}
