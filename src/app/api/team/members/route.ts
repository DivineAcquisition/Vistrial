// ============================================
// TEAM MEMBERS API
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getTeamMembers, inviteTeamMember, hasPermission } from '@/lib/team/members';

// GET - List team members
export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const org = context.organization as Record<string, any>;
    const members = await getTeamMembers(org.id);
    return NextResponse.json({ members });
  } catch (error) {
    console.error('Get team members error:', error);
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}

// POST - Invite team member
export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context?.organization || !context?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const org = context.organization as Record<string, any>;
    const membership = context.membership as Record<string, any> | null;
    const role = membership?.role || 'member';

    if (!hasPermission(role, 'team:invite')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    if (!body.email || !body.role) {
      return NextResponse.json({ error: 'Email and role are required' }, { status: 400 });
    }

    const validRoles = ['admin', 'member', 'viewer'];
    if (!validRoles.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const result = await inviteTeamMember(org.id, context.user.id, body.email, body.role);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Invitation sent to ${body.email}` });
  } catch (error) {
    console.error('Invite team member error:', error);
    return NextResponse.json({ error: 'Failed to invite team member' }, { status: 500 });
  }
}
