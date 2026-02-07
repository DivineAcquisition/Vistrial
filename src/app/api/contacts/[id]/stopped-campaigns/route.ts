// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = getSupabaseAdminClient();
    const { data } = await admin.from('workflow_enrollments').select('id, workflow_id, completed_at, workflows(name)').eq('contact_id', params.id).eq('organization_id', context.organization.id).eq('status', 'completed').order('completed_at', { ascending: false });
    const campaigns = data?.map(e => ({ id: e.id, workflowId: e.workflow_id, workflowName: e.workflows?.name || 'Unknown', stoppedAt: e.completed_at })) || [];
    return NextResponse.json({ campaigns });
  } catch (error) { return NextResponse.json({ error: 'Failed' }, { status: 500 }); }
}
