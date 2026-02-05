// @ts-nocheck
// ============================================
// ORGANIZATION HOOK
// Provides current organization context
// ============================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from './use-supabase';
import { useUser } from './use-user';
import type { Organization, OrganizationMember, CreditBalance } from '@/types/database';

interface OrganizationContext {
  organization: Organization | null;
  membership: Pick<OrganizationMember, 'role' | 'permissions'> | null;
  credits: CreditBalance | null;
}

interface UseOrganizationReturn extends OrganizationContext {
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  hasPermission: (permission: keyof OrganizationMember['permissions']) => boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

export function useOrganization(): UseOrganizationReturn {
  const supabase = useSupabase();
  const { user, isLoading: userLoading } = useUser();

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<Pick<OrganizationMember, 'role' | 'permissions'> | null>(null);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setOrganization(null);
      setMembership(null);
      setCredits(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch organization membership
      const { data: membershipData, error: membershipError } = await supabase
        .from('organization_members')
        .select(`
          role,
          permissions,
          organizations (*)
        `)
        .eq('user_id', user.id)
        .single();

      if (membershipError) {
        // User might not have an organization yet
        if (membershipError.code === 'PGRST116') {
          setOrganization(null);
          setMembership(null);
          setCredits(null);
          setIsLoading(false);
          return;
        }
        throw membershipError;
      }

      const org = membershipData.organizations as unknown as Organization;
      setOrganization(org);
      setMembership({
        role: membershipData.role as OrganizationMember['role'],
        permissions: membershipData.permissions as OrganizationMember['permissions'],
      });

      // Fetch credit balance
      if (org) {
        const { data: creditsData, error: creditsError } = await supabase
          .from('credit_balances')
          .select('*')
          .eq('organization_id', org.id)
          .single();

        if (!creditsError) {
          setCredits(creditsData as CreditBalance);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch organization'));
    } finally {
      setIsLoading(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    if (!userLoading) {
      refresh();
    }
  }, [user, userLoading, refresh]);

  const hasPermission = useCallback(
    (permission: keyof OrganizationMember['permissions']) => {
      if (!membership) return false;
      if (membership.role === 'owner') return true;
      return membership.permissions[permission] === true;
    },
    [membership]
  );

  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'admin' || isOwner;

  return {
    organization,
    membership,
    credits,
    isLoading: userLoading || isLoading,
    error,
    refresh,
    hasPermission,
    isOwner,
    isAdmin,
  };
}
