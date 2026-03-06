// ============================================
// SINGLE TEAM MEMBER API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { updateMemberRole, removeMember, hasPermission } from '@/lib/team/members';

// PATCH - Update member role
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization || !context?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = context.organization as Record<string, any>;
    const membership = context.membership as Record<string, any> | null;
    if (!hasPermission(membership?.role || 'member', 'team:invite')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();

    if (body.role) {
      const result = await updateMemberRole(org.id, params.id, body.role);
      if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ success: true, message: 'Role updated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}

// DELETE - Remove member
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization || !context?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = context.organization as Record<string, any>;
    const membership = context.membership as Record<string, any> | null;
    if (!hasPermission(membership?.role || 'member', 'team:invite')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const result = await removeMember(org.id, params.id, context.user.id);
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    return NextResponse.json({ error: 'Failed to remove team member' }, { status: 500 });
  }
}
