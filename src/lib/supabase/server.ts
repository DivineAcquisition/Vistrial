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
export async function getUserOrganization(userId: string) {
  const supabase = await getSupabaseServerClient();
  const { data: membership, error } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      role,
      permissions,
      organizations (
        id, name, slug, business_type, plan_tier,
        subscription_status, contact_limit, settings,
        logo_url, email, phone
      )
    `)
    .eq('user_id', userId)
    .single();

  if (error || !membership) return null;

  return {
    membership: {
      organization_id: membership.organization_id,
      role: membership.role,
      permissions: membership.permissions,
    },
    organization: membership.organizations,
  };
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
