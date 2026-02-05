// @ts-nocheck
// ============================================
// CREDITS HOOK
// Provides credit balance and refill functionality
// ============================================

'use client';

import { useCallback } from 'react';
import { useOrganization } from './use-organization';
import { useSupabase } from './use-supabase';

interface UseCreditsReturn {
  balance: number; // In cents
  balanceDollars: number;
  isLow: boolean;
  autoRefillEnabled: boolean;
  refillThreshold: number;
  refillAmount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
  updateRefillSettings: (settings: {
    auto_refill_enabled?: boolean;
    refill_threshold_cents?: number;
    refill_amount_cents?: number;
  }) => Promise<void>;
  formatCredits: (cents: number) => string;
}

export function useCredits(): UseCreditsReturn {
  const supabase = useSupabase();
  const { credits, organization, isLoading, refresh } = useOrganization();

  const balance = credits?.balance_cents ?? 0;
  const balanceDollars = balance / 100;
  const isLow = balance <= (credits?.refill_threshold_cents ?? 1500);
  const autoRefillEnabled = credits?.auto_refill_enabled ?? false;
  const refillThreshold = credits?.refill_threshold_cents ?? 1500;
  const refillAmount = credits?.refill_amount_cents ?? 5000;

  const updateRefillSettings = useCallback(
    async (settings: {
      auto_refill_enabled?: boolean;
      refill_threshold_cents?: number;
      refill_amount_cents?: number;
    }) => {
      if (!organization || !credits) {
        throw new Error('No organization or credits found');
      }

      // Validate minimum refill amount
      if (settings.refill_amount_cents !== undefined && settings.refill_amount_cents < 1500) {
        throw new Error('Minimum refill amount is $15.00');
      }

      const { error } = await supabase
        .from('credit_balances')
        .update(settings)
        .eq('organization_id', organization.id);

      if (error) {
        throw error;
      }

      await refresh();
    },
    [supabase, organization, credits, refresh]
  );

  const formatCredits = useCallback((cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(cents / 100);
  }, []);

  return {
    balance,
    balanceDollars,
    isLow,
    autoRefillEnabled,
    refillThreshold,
    refillAmount,
    isLoading,
    refresh,
    updateRefillSettings,
    formatCredits,
  };
}
