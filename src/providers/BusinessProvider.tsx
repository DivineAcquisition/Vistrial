"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './AuthProvider';

// Business type based on your schema
interface Business {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  trade: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  primary_color: string | null;
  settings: Record<string, unknown> | null;
  onboarding_completed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BusinessContextType {
  business: Business | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateBusiness: (updates: Partial<Business>) => Promise<{ error: Error | null }>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user, initialized: authInitialized } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);
  const supabase = createClient();

  const fetchBusiness = useCallback(async () => {
    // Don't fetch until auth is initialized
    if (!authInitialized) {
      return;
    }

    if (!user) {
      setBusiness(null);
      setLoading(false);
      setInitialized(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }
      
      setBusiness(data);
      hasFetched.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load business');
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [user, authInitialized, supabase]);

  const updateBusiness = async (updates: Partial<Business>) => {
    if (!business) return { error: new Error('No business to update') };

    try {
      const { error: updateError } = await supabase
        .from('businesses')
        .update(updates)
        .eq('id', business.id);

      if (updateError) throw updateError;

      setBusiness({ ...business, ...updates } as Business);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Failed to update') };
    }
  };

  useEffect(() => {
    // Only fetch when auth is initialized
    if (authInitialized) {
      fetchBusiness();
    }
  }, [fetchBusiness, authInitialized]);

  return (
    <BusinessContext.Provider value={{ business, loading, initialized, error, refetch: fetchBusiness, updateBusiness }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (context === undefined) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
