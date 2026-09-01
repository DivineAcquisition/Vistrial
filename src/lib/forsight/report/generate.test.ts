import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MonthlyMetrics } from "@/lib/forsight/report/types";

const state = vi.hoisted(() => ({
  existing: null as { id: string } | null,
  nextVersion: 1,
  inserts: [] as Array<Record<string, unknown>>,
  tables: [] as string[],
  hasMeta: false,
}));

function metrics(): MonthlyMetrics {
  return {
    funnel: {
      optedIn: 4,
      scored: 4,
      qualified: 2,
      contacted: 2,
      booked: 1,
      held: 1,
      closed: 0,
    },
    speed: {
      medianHoursToFirstHumanTouch: 2,
      readyContactedWithinFourHoursPercent: 50,
      averageTouchesOnClosed: null,
      averageTouchesOnLost: null,
      showRatePercent: 100,
      rebookRatePercent: null,
    },
    revenue: { newCents: null, repeatCents: null, recurringCents: null, reactivatedCents: null },
    nurture: { poolSize: null, rescoreResponses: null, movedToReady: null, revenueFromMovedCents: null },
    team: null,
    objections: [],
    omissions: [],
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      state.tables.push(table);
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: state.existing, error: null }),
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row);
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: `rep-${state.inserts.length}`,
                  org_id: row.org_id,
                  period_start: row.period_start,
                  period_end: row.period_end,
                  version: row.version,
                  generated_at: row.generated_at,
                  generated_by: row.generated_by,
                  generated_by_member_id: row.generated_by_member_id ?? null,
                  generated_by_name: row.generated_by_name ?? null,
                  source_type: row.source_type,
                  payload: row.payload,
                  omissions: row.omissions,
                },
                error: null,
              }),
            }),
          };
        },
      };
      return query;
    },
    rpc: async () => ({ data: state.nextVersion, error: null }),
  }),
}));

vi.mock("@/lib/forsight/provider", () => ({
  forsightProviderFor: async () => ({
    sourceType: "airtable",
    monthly: async () => ({ available: true, data: metrics() }),
  }),
}));

vi.mock("@/lib/forsight/sources", () => ({
  loadForsightSources: async () =>
    state.hasMeta ? [{ type: "meta_ads" }] : [],
}));

import { generateReport } from "@/lib/forsight/report/generate";
import type { ForsightDb } from "@/lib/forsight/sources";

const db = {} as ForsightDb;

describe("generateReport", () => {
  beforeEach(() => {
    state.existing = null;
    state.nextVersion = 1;
    state.inserts = [];
    state.tables = [];
    state.hasMeta = false;
  });

  it("skips a scheduled run when that period already has a report", async () => {
    state.existing = { id: "rep-1" };
    const result = await generateReport({
      db,
      orgId: "org-1",
      orgName: "Stellar",
      periodStart: "2026-08-01",
      actor: { kind: "scheduled", name: "scheduled" },
    });
    expect(result.status).toBe("skipped");
    expect(state.inserts).toHaveLength(0);
    expect(state.tables).not.toContain("forsight_report_sends");
  });

  it("inserts version 2 beside version 1 and does not send", async () => {
    const first = await generateReport({
      db,
      orgId: "org-1",
      orgName: "Stellar",
      periodStart: "2026-08-01",
      actor: { kind: "operator", memberId: "m1", name: "Dana" },
      replace: true,
    });
    expect(first.status).toBe("generated");
    if (first.status !== "generated") throw new Error("expected generated");
    expect(first.stored.version).toBe(1);
    expect(first.stored.generatedBy).toBe("operator");
    expect(first.stored.generatedByName).toBe("Dana");

    state.nextVersion = 2;
    state.existing = { id: "rep-1" };
    const second = await generateReport({
      db,
      orgId: "org-1",
      orgName: "Stellar",
      periodStart: "2026-08-01",
      actor: { kind: "operator", memberId: "m2", name: "Riley" },
      replace: true,
    });
    expect(second.status).toBe("generated");
    if (second.status !== "generated") throw new Error("expected generated");
    expect(second.stored.version).toBe(2);
    expect(second.stored.generatedByName).toBe("Riley");
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[0]?.version).toBe(1);
    expect(state.inserts[1]?.version).toBe(2);
    expect(state.tables).not.toContain("forsight_report_sends");
  });

  it("logs the ad-spend omission when the workspace has no Meta source", async () => {
    const result = await generateReport({
      db,
      orgId: "org-1",
      orgName: "Stellar",
      periodStart: "2026-08-01",
      actor: { kind: "operator", name: "Dana" },
      replace: true,
    });
    expect(result.status).toBe("generated");
    if (result.status !== "generated") throw new Error("expected generated");
    expect(result.stored.omissions.some((row) => row.line === "Ad spend")).toBe(true);
    const payload = JSON.stringify(result.stored.report.sections);
    expect(payload).not.toMatch(/ad spend/i);
  });
});
