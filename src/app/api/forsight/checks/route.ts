import { NextResponse, type NextRequest } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { ForsightSourceError } from "@/lib/forsight/errors";
import { readWorkspaceAdSpend } from "@/lib/forsight/meta";
import { forsightProviderFor } from "@/lib/forsight/provider";
import type { ForsightResult } from "@/lib/forsight/types";
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

    const [weeks, creatives, pipeline] = await Promise.all([
      provider.weeks(),
      provider.creatives(),
      provider.pipeline(),
    ]);

    return NextResponse.json({
      workspace: { id: ctx.org.id, name: ctx.org.name },
      source: provider.sourceType,
      datasets: [
        describe("weeks", weeks, (data) => data.weeks.length),
        describe("creatives", creatives, (data) => data.length),
        describe("pipeline", pipeline, (data) => data.totalLeads),
      ],
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

function describe<T>(
  name: string,
  result: ForsightResult<T>,
  count: (data: T) => number
) {
  return result.available
    ? { dataset: name, available: true, rows: count(result.data) }
    : { dataset: name, available: false, reason: result.reason };
}
