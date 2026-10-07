import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { metaConfigured, normalizeMetaAdAccountId } from "@/lib/forsight/env";
import { fetchMetaAdInsights } from "@/lib/forsight/meta";
import { loadConnection } from "@/lib/ghl/tokens";
import { createClient } from "@/lib/supabase/server";
import { isoDate } from "@/lib/forsight/weeks";
import type { ForsightSourceType } from "@/lib/forsight/types";
import type { TablesInsert } from "@/types/database";

/**
 * Provisioning, for operators only.
 *
 * It exists so Divine Acquisition can attach a client's ad account or
 * calendar, and a client user can never reach it. That is enforced by
 * row-level security on `forsight_sources` — an insert or update from a client
 * user is refused by Postgres, not merely hidden behind a missing link — and
 * by `requireForsightOperator` on every entry point here.
 */

export type SourceDraft = {
  orgId: string;
  sourceType: ForsightSourceType;
  label?: string | null;
  metaAdAccountId?: string | null;
  ghlCalendarId?: string | null;
};

export type SourceTestResult = { ok: true; detail: string } | { ok: false; error: string };

/** Every operator entry point starts here. */
export async function requireForsightOperator() {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return null;
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

export function draftToRow(draft: SourceDraft): TablesInsert<"forsight_sources"> {
  return {
    org_id: draft.orgId,
    source_type: draft.sourceType,
    status: "active",
    label: draft.label?.trim() || null,
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
