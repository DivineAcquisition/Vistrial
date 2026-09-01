import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { ForsightSourceError } from "@/lib/forsight/errors";
import { readWorkspaceAdSpend } from "@/lib/forsight/meta";
import { forsightProviderFor } from "@/lib/forsight/provider";
import { FORSIGHT_DATASETS, type ForsightDataset } from "@/lib/forsight/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Proves a workspace's connections from the outside without building a screen
 * for it. Read-only, Divine Acquisition operators only, and scoped to the
 * caller's active workspace so it can never reach across tenants.
 *
 * GET /api/forsight/checks?source=airtable
 * GET /api/forsight/checks?source=meta&since=2026-08-01&until=2026-08-31
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const source = params.get("source") ?? "airtable";
  const supabase = await createClient();

  try {
    if (source === "meta") {
      const today = new Date();
      const until = params.get("until") ?? isoDate(today);
      const since = params.get("since") ?? isoDate(new Date(today.getTime() - 6 * 86_400_000));
      const result = await readWorkspaceAdSpend(supabase, {
        orgId: ctx.org.id,
        orgName: ctx.org.name,
        since,
        until,
      });
      return NextResponse.json({
        workspace: { id: ctx.org.id, name: ctx.org.name },
        source: "meta_ads",
        adAccountId: result.adAccountId,
        range: { since: result.since, until: result.until },
        ads: result.rows.length,
        totalSpend: result.totalSpend,
        totalImpressions: result.totalImpressions,
        totalClicks: result.totalClicks,
      });
    }

    const provider = await forsightProviderFor(supabase, {
      orgId: ctx.org.id,
      orgName: ctx.org.name,
    });
    const requested = datasetsFrom(params.get("dataset"));
    const results = await Promise.all(
      requested.map((dataset) => provider.readDataset(dataset, { maxRecords: 1 }))
    );

    return NextResponse.json({
      workspace: { id: ctx.org.id, name: ctx.org.name },
      source: provider.sourceType,
      datasets: results.map((result) =>
        result.available
          ? { dataset: result.dataset, available: true, sampleRecords: result.records.length }
          : { dataset: result.dataset, available: false, reason: result.reason }
      ),
    });
  } catch (error) {
    if (error instanceof ForsightSourceError) {
      return NextResponse.json(
        { error: error.message, reason: error.reason, workspaceId: error.orgId },
        { status: 502 }
      );
    }
    throw error;
  }
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function datasetsFrom(value: string | null): ForsightDataset[] {
  if (!value) return [...FORSIGHT_DATASETS];
  const match = FORSIGHT_DATASETS.find((dataset) => dataset === value);
  return match ? [match] : [...FORSIGHT_DATASETS];
}
