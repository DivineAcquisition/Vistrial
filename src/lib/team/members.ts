// ============================================
// TEAM MEMBER MANAGEMENT
// ============================================

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkUsageLimit } from '@/lib/middleware/usage-enforcement';

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface TeamMember {
  id: string;
  organizationId: string;
  userId: string | null;
  email: string;
  role: MemberRole;
  status: 'active' | 'invited' | 'disabled';
  invitedAt: string | null;
  invitedBy: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Full access including billing and team management',
  admin: 'Manage team members and all features except billing',
  member: 'Create and manage contacts, workflows, and messages',
  viewer: 'View-only access to all features',
};

export const ROLE_PERMISSIONS: Record<MemberRole, string[]> = {
  owner: ['*'],
  admin: ['contacts:read', 'contacts:write', 'workflows:read', 'workflows:write', 'messages:read', 'messages:write', 'booking:read', 'booking:write', 'analytics:read', 'settings:read', 'settings:write', 'team:read', 'team:invite'],
  member: ['contacts:read', 'contacts:write', 'workflows:read', 'workflows:write', 'messages:read', 'messages:write', 'booking:read', 'booking:write', 'analytics:read'],
  viewer: ['contacts:read', 'workflows:read', 'messages:read', 'booking:read', 'analytics:read'],
};

export function hasPermission(role: MemberRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes('*') || perms.includes(permission);
}

export async function getTeamMembers(organizationId: string): Promise<TeamMember[]> {
  const admin = getSupabaseAdminClient();

  const { data, error } = await admin
    .from('organization_members')
    .select('id, organization_id, user_id, email, role, status, invited_at, invited_by, joined_at, last_active_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch team members:', error);
    return [];
  }

  return (data || []).map((m: any) => ({
    id: m.id,
    organizationId: m.organization_id,
    userId: m.user_id,
    email: m.email || '',
    role: (m.role || 'member') as MemberRole,
    status: (m.status || 'active') as 'active' | 'invited' | 'disabled',
    invitedAt: m.invited_at,
    invitedBy: m.invited_by,
    joinedAt: m.joined_at,
    lastActiveAt: m.last_active_at,
  }));
}

export async function inviteTeamMember(
  organizationId: string,
  invitedBy: string,
  email: string,
  role: MemberRole
): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdminClient();

  const usageCheck = await checkUsageLimit(organizationId, 'team_member');
  if (!usageCheck.allowed) {
    return { success: false, error: usageCheck.reason || 'Team member limit reached' };
  }

  const { data: existing } = await admin
    .from('organization_members')
    .select('id, status')
    .eq('organization_id', organizationId)
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existing) {
    if (existing.status === 'active') return { success: false, error: 'Already a team member' };
    if (existing.status === 'invited') return { success: false, error: 'Invitation already sent' };
  }

  const { error } = await admin.from('organization_members').insert({
    organization_id: organizationId,
    user_id: null,
    email: email.toLowerCase(),
    role,
    status: 'invited',
    invited_at: new Date().toISOString(),
    invited_by: invitedBy,
  });

  if (error) {
    console.error('Failed to invite member:', error);
    return { success: false, error: 'Failed to send invitation' };
  }

  return { success: true };
}

export async function updateMemberRole(
  organizationId: string,
  memberId: string,
  newRole: MemberRole
): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdminClient();

  const { data: member } = await admin
    .from('organization_members')
    .select('role')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .single();

  if (!member) return { success: false, error: 'Member not found' };
  if (member.role === 'owner') return { success: false, error: 'Cannot change owner role' };
  if (newRole === 'owner') return { success: false, error: 'Cannot assign owner role' };

  const { error } = await admin
    .from('organization_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('organization_id', organizationId);

  if (error) return { success: false, error: 'Failed to update role' };
  return { success: true };
}

export async function removeMember(
  organizationId: string,
  memberId: string,
  removedBy: string
): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdminClient();

  const { data: member } = await admin
    .from('organization_members')
    .select('role, user_id')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .single();

  if (!member) return { success: false, error: 'Member not found' };
  if (member.role === 'owner') return { success: false, error: 'Cannot remove owner' };
  if (member.user_id === removedBy) return { success: false, error: 'Cannot remove yourself' };

  const { error } = await admin
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', organizationId);

  if (error) return { success: false, error: 'Failed to remove member' };
  return { success: true };
}
