// ============================================
// TEAM SETTINGS PAGE
// ============================================

import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthenticatedContext } from '@/lib/supabase/server';
import { getTeamMembers, hasPermission, type MemberRole } from '@/lib/team/members';
import { checkUsageLimit } from '@/lib/middleware/usage-enforcement';
import { PLANS } from '@/lib/stripe/plans';
import { TeamSettingsView } from '@/components/settings/team-settings-view';

export const metadata: Metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const context = await getAuthenticatedContext();
  if (!context?.organization) redirect('/login');

  const org = context.organization as Record<string, any>;
  const membership = context.membership as Record<string, any> | null;
  const role = (membership?.role || 'member') as MemberRole;

  let members: any[] = [];
  try {
    members = await getTeamMembers(org.id);
  } catch {
    // Table might not have the new columns yet
  }

  let usageCheck: any = { allowed: true, currentUsage: members.length, limit: 1, remaining: 0 };
  try {
    usageCheck = await checkUsageLimit(org.id, 'team_member');
  } catch {}

  const planId = org.subscription_plan || org.plan_tier || 'lite';
  const plan = PLANS[planId];

  return (
    <TeamSettingsView
      members={members}
      currentUserId={context.user?.id || ''}
      currentUserRole={role}
      canInvite={hasPermission(role, 'team:invite')}
      usageCheck={usageCheck}
      teamLimit={plan?.features.teamMembers || 1}
      organizationName={org.name || 'Your Organization'}
    />
  );
}
