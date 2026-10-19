import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RawLead, RawOrgContext } from "@/lib/assay/build";
import type { AssayStore, ScoreRow } from "@/lib/assay/score-org";
import { getEffectiveConfig } from "@/lib/config/server";
import type { Database, Json } from "@/types/database";

type Db = SupabaseClient<Database>;
type Loose = SupabaseClient;

/** Assay's reads and writes for the queue, with the service-role client the job holds. */
export function supabaseAssayStore(db: Db): AssayStore {
  const loose = db as unknown as Loose;
  return {
    async config(orgId) {
      const config = await getEffectiveConfig(db, orgId);
      return { values: config.values as Record<string, unknown>, slug: config.templateSlug, version: config.version };
    },
    async context(orgId) {
      const { data, error } = await loose.rpc("assay_org_context", { p_org_id: orgId });
      if (error) throw new Error("assay_context_failed");
      return data as RawOrgContext;
    },
    async leads(orgId, page) {
      const { data, error } = await loose.rpc("assay_lead_inputs", {
        p_org_id: orgId,
        p_lead_ids: page.ids,
        p_after: page.after,
        p_limit: page.limit,
      });
      if (error) throw new Error("assay_inputs_failed");
      return (data ?? []) as RawLead[];
    },
    async write(orgId, rows: ScoreRow[]) {
      const { data, error } = await loose.rpc("assay_write_scores", { p_org_id: orgId, p_rows: rows as unknown as Json });
      if (error) throw new Error("assay_write_failed");
      return Number(data ?? 0);
    },
  };
}
