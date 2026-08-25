import { describe, expect, it } from "vitest";

import { stagingCrmBlocked } from "@/lib/ops/crm-guard";
import { assertStagingCannotReachProductionDb, vistrialEnv } from "@/lib/ops/env";
import { isJobOverdue } from "@/lib/ops/job-overdue";
import { estimatedSpendUsd } from "@/lib/ops/spend";
import { rateLimitKey } from "@/lib/ops/rate-limit";
import { exportFilename } from "@/lib/ops/export";

describe("vistrialEnv", () => {
  it("reads VISTRIAL_ENV and does not invent a fourth environment", () => {
    expect(vistrialEnv("staging")).toBe("staging");
    expect(vistrialEnv("production")).toBe("production");
    expect(vistrialEnv("development")).toBe("development");
    expect(vistrialEnv("")).toBe("development");
  });
});

describe("staging database isolation", () => {
  it("throws when staging is pointed at a production Supabase URL", () => {
    expect(() =>
      assertStagingCannotReachProductionDb({
        env: "staging",
        supabaseUrl: "https://prod.supabase.co",
        productionUrls: ["https://prod.supabase.co"],
      })
    ).toThrow("staging_points_at_production_database");
  });

  it("refuses a deployed staging env with no production denylist", () => {
    expect(() =>
      assertStagingCannotReachProductionDb({
        env: "staging",
        supabaseUrl: "https://staging.supabase.co",
        productionUrls: [],
        requireDenylist: true,
      })
    ).toThrow("staging_missing_production_db_denylist");
  });

  it("allows staging when the URL is not on the production denylist", () => {
    expect(() =>
      assertStagingCannotReachProductionDb({
        env: "staging",
        supabaseUrl: "https://staging.supabase.co",
        productionUrls: ["https://prod.supabase.co"],
      })
    ).not.toThrow();
  });
});

describe("staging CRM allowlist", () => {
  it("blocks every location when staging allowlist is empty", () => {
    expect(
      stagingCrmBlocked({ locationId: "loc_prod_1", env: "staging", allowedLocationIds: [] })
    ).toEqual({ blocked: true, reason: "not_allowlisted" });
  });

  it("allows only listed sandbox location ids in staging", () => {
    expect(
      stagingCrmBlocked({
        locationId: "loc_sandbox",
        env: "staging",
        allowedLocationIds: ["loc_sandbox"],
      })
    ).toEqual({ blocked: false });
    expect(
      stagingCrmBlocked({
        locationId: "loc_prod",
        env: "staging",
        allowedLocationIds: ["loc_sandbox"],
      }).blocked
    ).toBe(true);
  });

  it("does not apply the allowlist in production", () => {
    expect(
      stagingCrmBlocked({ locationId: "loc_prod", env: "production", allowedLocationIds: [] })
    ).toEqual({ blocked: false });
  });
});

describe("missed jobs", () => {
  it("is overdue when last success is older than interval plus grace", () => {
    const now = new Date("2026-08-25T12:00:00Z");
    expect(
      isJobOverdue({
        lastSuccessAt: "2026-08-25T11:58:00Z",
        intervalSeconds: 60,
        graceSeconds: 120,
        now,
      })
    ).toBe(false);
    expect(
      isJobOverdue({
        lastSuccessAt: "2026-08-25T11:50:00Z",
        intervalSeconds: 60,
        graceSeconds: 120,
        now,
      })
    ).toBe(true);
  });

  it("treats a job that has never succeeded as overdue", () => {
    expect(
      isJobOverdue({ lastSuccessAt: null, intervalSeconds: 60, graceSeconds: 120 })
    ).toBe(true);
  });
});

describe("model spend estimate", () => {
  it("prices opus higher than the default sonnet rate", () => {
    const sonnet = estimatedSpendUsd({ model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 0 });
    const opus = estimatedSpendUsd({ model: "claude-opus-4-6", inputTokens: 1_000_000, outputTokens: 0 });
    expect(sonnet).toBe(3);
    expect(opus).toBe(15);
  });
});

describe("rate limit keys", () => {
  it("hashes so raw emails are not the bucket key", () => {
    const key = rateLimitKey(["auth", "owner@vistrial.local", "1.1.1.1"]);
    expect(key).toHaveLength(64);
    expect(key).not.toContain("owner@");
  });
});

describe("export filename", () => {
  it("is portable and dated", () => {
    expect(exportFilename({ slug: "northstar" })).toMatch(/^vistrial-northstar-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
