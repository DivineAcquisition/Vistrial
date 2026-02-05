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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Return a mock client for build time
    const mockChain = (): unknown => ({
      select: mockChain,
      insert: mockChain,
      update: mockChain,
      delete: mockChain,
      upsert: mockChain,
      eq: mockChain,
      neq: mockChain,
      gt: mockChain,
      gte: mockChain,
      lt: mockChain,
      lte: mockChain,
      in: mockChain,
      order: mockChain,
      limit: mockChain,
      range: mockChain,
      filter: mockChain,
      match: mockChain,
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    });

    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signUp: async () => ({ data: null, error: null }),
        signInWithPassword: async () => ({ data: null, error: null }),
        signInWithOAuth: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
        resetPasswordForEmail: async () => ({ error: null }),
        updateUser: async () => ({ data: null, error: null }),
        exchangeCodeForSession: async () => ({ data: null, error: null }),
      },
      from: () => mockChain(),
      rpc: async () => ({ data: null, error: null }),
    } as unknown as ReturnType<typeof createServerClient<Database>>;
  }

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}

// Backward compatibility alias
export const createServerSupabaseClient = getSupabaseServerClient;

// Helper to get current user on the server
export async function getServerUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

// Helper to get current session on the server
export async function getServerSession() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return null;
  }

  return session;
}

// Helper to require authentication (throws redirect if not authenticated)
export async function requireAuth() {
  const user = await getServerUser();

  if (!user) {
    throw new Error('Unauthorized');
  }

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
        id,
        name,
        slug,
        business_type,
        plan_tier,
        subscription_status,
        contact_limit,
        settings
      )
    `)
    .eq('user_id', userId)
    .single();

  if (error || !membership) {
    return null;
  }

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

  if (!user) {
    return null;
  }

  const orgData = await getUserOrganization(user.id);

  if (!orgData) {
    return { user, organization: null, membership: null };
  }

  return {
    user,
    organization: orgData.organization,
    membership: orgData.membership,
  };
}

// Alias for backward compatibility
export const createClient = getSupabaseServerClient;
