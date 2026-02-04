/**
 * useOrganization Hook
 * 
 * Hook for accessing organization/business data:
 * - Current business profile
 * - Team members
 * - Business settings
 * - Subscription status
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "./use-user";

interface Business {
  id: string;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  logo_url?: string;
  is_active: boolean;
  subscription_status?: string;
  subscription_plan?: string;
  created_at: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  email: string;
  name?: string;
}

interface UseOrganizationReturn {
  business: Business | null;
  teamMembers: TeamMember[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  updateBusiness: (updates: Partial<Business>) => Promise<void>;
}

export function useOrganization(): UseOrganizationReturn {
  const { user } = useUser();
  const [business, setBusiness] = useState<Business | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchOrganization = useCallback(async () => {
    if (!user) {
      setBusiness(null);
      setTeamMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // Fetch business
      const { data: businessData, error: businessError } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();

      if (businessError) throw businessError;
      
      setBusiness(businessData);

      // Fetch team members if business exists
      if (businessData) {
        // TODO: Fetch from business_members table when implemented
        setTeamMembers([
          {
            id: "1",
            user_id: user.id,
            role: "owner",
            email: user.email || "",
            name: user.user_metadata?.full_name,
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch organization"));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const updateBusiness = useCallback(async (updates: Partial<Business>) => {
    if (!business) throw new Error("No business found");

    const supabase = createClient();
    const { error } = await supabase
      .from("businesses")
      .update(updates)
      .eq("id", business.id);

    if (error) throw error;

    setBusiness({ ...business, ...updates });
  }, [business]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  return {
    business,
    teamMembers,
    loading,
    error,
    refresh: fetchOrganization,
    updateBusiness,
  };
}
