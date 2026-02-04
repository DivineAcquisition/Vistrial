/**
 * useCredits Hook
 * 
 * Hook for managing credit balance:
 * - Current balance
 * - Usage breakdown
 * - Low balance warnings
 * - Refill actions
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "./use-organization";

interface CreditBalance {
  total: number;
  remaining: number;
  used: number;
}

interface CreditBreakdown {
  sms: number;
  voice: number;
  ai: number;
}

interface UsageRecord {
  id: string;
  type: "sms" | "voice" | "ai";
  credits: number;
  description: string;
  created_at: string;
}

interface UseCreditsReturn {
  balance: CreditBalance;
  breakdown: CreditBreakdown;
  recentUsage: UsageRecord[];
  isLow: boolean;
  isCritical: boolean;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  refillCredits: (amount: number) => Promise<void>;
}

const LOW_THRESHOLD = 100;
const CRITICAL_THRESHOLD = 25;

export function useCredits(): UseCreditsReturn {
  const { business } = useOrganization();
  const [balance, setBalance] = useState<CreditBalance>({
    total: 0,
    remaining: 0,
    used: 0,
  });
  const [breakdown, setBreakdown] = useState<CreditBreakdown>({
    sms: 0,
    voice: 0,
    ai: 0,
  });
  const [recentUsage, setRecentUsage] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchCredits = useCallback(async () => {
    if (!business) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // TODO: Fetch from credits table when implemented
      // For now, use mock data or business credit_balance field
      const { data: businessData } = await supabase
        .from("businesses")
        .select("credit_balance, monthly_credits")
        .eq("id", business.id)
        .single();

      if (businessData) {
        const remaining = businessData.credit_balance || 0;
        const total = businessData.monthly_credits || 1000;
        
        setBalance({
          total,
          remaining,
          used: total - remaining,
        });
      }

      // TODO: Fetch usage breakdown from usage_logs table
      setBreakdown({
        sms: 0,
        voice: 0,
        ai: 0,
      });

      // TODO: Fetch recent usage records
      setRecentUsage([]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch credits"));
    } finally {
      setLoading(false);
    }
  }, [business]);

  const refillCredits = useCallback(async (amount: number) => {
    try {
      const response = await fetch("/api/billing/refill-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to refill credits");
      }

      // Refresh balance after refill
      await fetchCredits();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to refill credits");
    }
  }, [fetchCredits]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const isLow = balance.remaining < LOW_THRESHOLD;
  const isCritical = balance.remaining < CRITICAL_THRESHOLD;

  return {
    balance,
    breakdown,
    recentUsage,
    isLow,
    isCritical,
    loading,
    error,
    refresh: fetchCredits,
    refillCredits,
  };
}
