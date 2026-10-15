import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { asTrust, TRUST_FALLBACK, type SubprocessorPublic, type TrustPublic } from "@/lib/trust/model";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type { TrustPublic, TrustSwitches } from "@/lib/trust/model";

type SubRow = { company: string; purpose: string; data_handled: string; location: string };

export type SubprocessorRow = SubprocessorPublic;

export async function loadTrustPublic(): Promise<TrustPublic> {
  try {
    const db = getSupabaseAdmin() as unknown as SupabaseClient;
    const { data, error } = await db.rpc("public_trust_snapshot");
    if (error || !data || typeof data !== "object") return TRUST_FALLBACK;
    return asTrust(data as Record<string, unknown>);
  } catch {
    return TRUST_FALLBACK;
  }
}

export async function loadPublicSubprocessors(): Promise<SubprocessorRow[]> {
  try {
    const db = getSupabaseAdmin() as unknown as SupabaseClient;
    const { data, error } = await db.rpc("public_subprocessors");
    if (error || !Array.isArray(data)) return [];
    return (data as SubRow[]).map((row) => ({
      company: row.company,
      purpose: row.purpose,
      dataHandled: row.data_handled,
      location: row.location,
    }));
  } catch {
    return [];
  }
}
