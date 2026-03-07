// @ts-nocheck
// ============================================
// SUPABASE SERVER CLIENT
// Used in Server Components, Route Handlers, Server Actions
// ============================================

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component - ignored
          }
        },
      },
    }
  );
}

// Backward compatibility aliases
export const createServerSupabaseClient = getSupabaseServerClient;
export const createClient = getSupabaseServerClient;

// Helper to get current user on the server
export async function getServerUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Helper to get current session
export async function getServerSession() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

// Helper to require authentication
export async function requireAuth() {
  const user = await getServerUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

// Helper to get user's organization
// Uses admin client to bypass RLS — this is server-side only
export async function getUserOrganization(userId: string) {
  try {
    const { getSupabaseAdminClient } = await import('./admin');
    const admin = getSupabaseAdminClient();

    const { data: memberships, error } = await admin
      .from('organization_members')
      .select(`
        organization_id,
        role,
        permissions,
        organizations (*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !memberships || memberships.length === 0) {
      console.log('getUserOrganization: no membership found for user', userId, error?.message);
      return null;
    }

    // If user has multiple orgs, prefer the one with onboarding not completed (most recent signup).
    // Otherwise, pick the most recently created.
    let membership = memberships[0];
    for (const m of memberships) {
      const org = (m as any).organizations;
      if (org && org.onboarding_completed === false) {
        membership = m;
        break;
      }
    }

    return {
      membership: {
        organization_id: membership.organization_id,
        role: membership.role,
        permissions: membership.permissions,
      },
      organization: (membership as any).organizations,
    };
  } catch (adminError) {
    console.error('getUserOrganization admin error, falling back to anon:', adminError);

    const supabase = await getSupabaseServerClient();
    const { data: memberships, error } = await supabase
      .from('organization_members')
      .select(`
        organization_id,
        role,
        permissions,
        organizations (*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !memberships || memberships.length === 0) return null;

    let membership = memberships[0];
    for (const m of memberships) {
      const org = (m as any).organizations;
      if (org && org.onboarding_completed === false) {
        membership = m;
        break;
      }
    }

    return {
      membership: {
        organization_id: membership.organization_id,
        role: membership.role,
        permissions: membership.permissions,
      },
      organization: (membership as any).organizations,
    };
  }
}

// Helper to get user with organization context
export async function getAuthenticatedContext() {
  const user = await getServerUser();
  if (!user) return null;

  const orgData = await getUserOrganization(user.id);
  if (!orgData) return { user, organization: null, membership: null };

  return {
    user,
    organization: orgData.organization,
    membership: orgData.membership,
  };
}

// Check if user has specific role or higher
export function hasRole(
  context: { membership?: { role?: string } | null } | null,
  requiredRole: 'owner' | 'admin' | 'member' | 'viewer'
): boolean {
  if (!context?.membership?.role) return false;

  const roleHierarchy = ['viewer', 'member', 'admin', 'owner'];
  const userRoleIndex = roleHierarchy.indexOf(context.membership.role);
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

  return userRoleIndex >= requiredRoleIndex;
}
