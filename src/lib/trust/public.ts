import "server-only";

import { TRUST_FALLBACK, type SubprocessorPublic, type TrustPublic } from "@/lib/trust/model";

export type { TrustPublic, TrustSwitches } from "@/lib/trust/model";

export type SubprocessorRow = SubprocessorPublic;

/** Static public trust copy. The old database snapshot is retired with Supabase. */
export async function loadTrustPublic(): Promise<TrustPublic> {
  return TRUST_FALLBACK;
}

export async function loadPublicSubprocessors(): Promise<SubprocessorRow[]> {
  return [];
}
