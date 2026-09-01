import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import {
  credentialConfiguredFor,
  loadForsightSources,
  summarizeSource,
} from "@/lib/forsight/sources";
import type { ForsightSourceSummary } from "@/lib/forsight/types";
import { createClient } from "@/lib/supabase/server";

/**
 * The active workspace's Forsight source, resolved the same way every other
 * section resolves a workspace. The read goes through the caller's own
 * Supabase client, so row-level security — not this function — is what keeps
 * one workspace's source out of another's hands.
 */
export async function loadForsightOverview(): Promise<{
  orgId: string;
  orgName: string;
  metrics: ForsightSourceSummary;
  adSpendConfigured: boolean;
}> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const sources = await loadForsightSources(supabase, ctx.org.id);

  const airtable = sources.find((source) => source.type === "airtable") ?? null;
  const meta = sources.find((source) => source.type === "meta_ads") ?? null;

  return {
    orgId: ctx.org.id,
    orgName: ctx.org.name,
    metrics: summarizeSource({
      orgId: ctx.org.id,
      orgName: ctx.org.name,
      source: airtable,
      credentialConfigured: credentialConfiguredFor("airtable"),
    }),
    adSpendConfigured: Boolean(meta) && credentialConfiguredFor("meta_ads"),
  };
}
