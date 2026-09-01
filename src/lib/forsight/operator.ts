import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { listAirtableRecords } from "@/lib/forsight/airtable";
import { airtableConfigured, metaConfigured, normalizeMetaAdAccountId } from "@/lib/forsight/env";
import { fetchMetaAdInsights } from "@/lib/forsight/meta";
import { loadConnection } from "@/lib/ghl/tokens";
import { createClient } from "@/lib/supabase/server";
import { isoDate } from "@/lib/forsight/weeks";
import type { ForsightSourceType } from "@/lib/forsight/types";
import type { TablesInsert } from "@/types/database";

/**
 * Provisioning, for operators only.
 *
 * This is the one screen in Forsight that asks anyone to type a base ID, and
 * the exception is narrow: it exists so Divine Acquisition can onboard a
 * client, and a client user can never reach it. That is enforced by row-level
 * security on `forsight_sources` — an insert or update from a client user is
 * refused by Postgres, not merely hidden behind a missing link — and by
 * `requireForsightOperator` on every entry point here.
 */

export type SourceDraft = {
  orgId: string;
  sourceType: ForsightSourceType;
  label?: string | null;
  airtableBaseId?: string | null;
  airtableTables?: {
    leads: boolean;
    creatives: boolean;
    weeklySummary: boolean;
    touches: boolean;
  };
  metaAdAccountId?: string | null;
  ghlCalendarId?: string | null;
};

export type SourceTestResult = { ok: true; detail: string } | { ok: false; error: string };

/** Every operator entry point starts here. */
export async function requireForsightOperator() {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return null;
  return ctx;
}

export async function listWorkspacesForOperator(): Promise<
  Array<{ id: string; name: string; slug: string }>
> {
  const ctx = await requireForsightOperator();
  if (!ctx) return [];

  // The user's own client, so `user_org_ids()` decides what comes back. For a
  // platform admin that is every workspace; for anyone else it would be their
  // own, and the gate above has already refused them.
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .order("name", { ascending: true });
  return data ?? [];
}

const DEFAULT_TABLES = {
  leads: "Leads",
  creatives: "Creatives",
  weeklySummary: "Weekly Summary",
  touches: "Touches",
} as const;

export function draftToRow(draft: SourceDraft): TablesInsert<"forsight_sources"> {
  const tables = draft.airtableTables ?? {
    leads: true,
    creatives: true,
    weeklySummary: true,
    touches: true,
  };

  return {
    org_id: draft.orgId,
    source_type: draft.sourceType,
    status: "active",
    label: draft.label?.trim() || null,
    airtable_base_id:
      draft.sourceType === "airtable" ? (draft.airtableBaseId?.trim() ?? null) : null,
    airtable_leads_table:
      draft.sourceType === "airtable" && tables.leads ? DEFAULT_TABLES.leads : null,
    airtable_creatives_table:
      draft.sourceType === "airtable" && tables.creatives ? DEFAULT_TABLES.creatives : null,
    airtable_weekly_summary_table:
      draft.sourceType === "airtable" && tables.weeklySummary
        ? DEFAULT_TABLES.weeklySummary
        : null,
    airtable_touches_table:
      draft.sourceType === "airtable" && tables.touches ? DEFAULT_TABLES.touches : null,
    meta_ad_account_id:
      draft.sourceType === "meta_ads"
        ? normalizeMetaAdAccountId(draft.metaAdAccountId ?? "") || null
        : null,
    ghl_calendar_id: draft.sourceType === "ghl" ? (draft.ghlCalendarId?.trim() ?? null) : null,
  };
}

/**
 * Proves the source answers before anything is written.
 *
 * A record that saves cleanly and fails at the client's first login is the
 * worst version of this feature: the operator has moved on, and the client
 * meets a broken dashboard. So the save path runs this first and refuses to
 * write when it fails.
 */
export async function testSourceDraft(draft: SourceDraft): Promise<SourceTestResult> {
  const ctx = await requireForsightOperator();
  if (!ctx) return { ok: false, error: "Not found." };

  const supabase = await createClient();

  try {
    switch (draft.sourceType) {
      case "airtable": {
        const baseId = draft.airtableBaseId?.trim();
        if (!baseId) return { ok: false, error: "Enter the Airtable base ID." };
        if (!airtableConfigured()) {
          return { ok: false, error: "AIRTABLE_API_KEY is not set on this deployment." };
        }

        const wanted = draft.airtableTables ?? {
          leads: true,
          creatives: true,
          weeklySummary: true,
          touches: true,
        };
        const tables = (Object.keys(DEFAULT_TABLES) as Array<keyof typeof DEFAULT_TABLES>)
          .filter((key) => wanted[key])
          .map((key) => DEFAULT_TABLES[key]);

        if (tables.length === 0) {
          return { ok: false, error: "Pick at least one table for this base." };
        }

        // Every named table is read, so a base missing one fails here rather
        // than on the client's dashboard.
        for (const table of tables) {
          await listAirtableRecords({
            orgId: draft.orgId,
            orgLabel: null,
            baseId,
            table,
            maxRecords: 1,
          });
        }
        return { ok: true, detail: `Read ${tables.length} table${tables.length === 1 ? "" : "s"} from ${baseId}.` };
      }

      case "meta_ads": {
        const account = normalizeMetaAdAccountId(draft.metaAdAccountId ?? "");
        if (!account) return { ok: false, error: "Enter the Meta ad account ID." };
        if (!metaConfigured()) {
          return { ok: false, error: "META_ACCESS_TOKEN is not set on this deployment." };
        }
        const today = isoDate(new Date());
        const insights = await fetchMetaAdInsights({
          orgId: draft.orgId,
          adAccountId: account,
          since: today,
          until: today,
        });
        return { ok: true, detail: `${account} answered with ${insights.rows.length} ad rows for today.` };
      }

      case "ghl": {
        const connection = await loadConnection(supabase, draft.orgId);
        if (!connection?.location_id || connection.status !== "active") {
          return {
            ok: false,
            error:
              "This workspace has no active LeadConnector connection. Forsight reads GHL through the existing OAuth, so connect it first.",
          };
        }
        return {
          ok: true,
          detail: `LeadConnector location ${connection.location_name ?? connection.location_id} is connected.`,
        };
      }

      case "vistrial_core": {
        const { count, error } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("org_id", draft.orgId);
        if (error) return { ok: false, error: `Could not read this workspace's leads: ${error.message}` };
        return { ok: true, detail: `This workspace has ${count ?? 0} leads in Vistrial.` };
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The test failed." };
  }
}
