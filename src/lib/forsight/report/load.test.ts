import { describe, expect, it } from "vitest";

import { periodPath, periodStartFromParam, rowToStored } from "@/lib/forsight/report/load";
import type { ForsightReport } from "@/lib/forsight/report/types";
import type { Json } from "@/types/database";

describe("periodStartFromParam", () => {
  it("accepts YYYY-MM and YYYY-MM-DD, and refuses junk", () => {
    expect(periodStartFromParam("2026-08")).toBe("2026-08-01");
    expect(periodStartFromParam("2026-08-01")).toBe("2026-08-01");
    expect(periodStartFromParam("2026-13")).toBeNull();
    expect(periodStartFromParam("live")).toBeNull();
  });

  it("builds the URL month from the first of the month", () => {
    expect(periodPath("2026-08-01")).toBe("2026-08");
  });
});

describe("rowToStored", () => {
  it("returns the payload as stored, not a live recompute", () => {
    const report: ForsightReport = {
      schemaVersion: 1,
      workspace: { id: "org-1", name: "Stellar" },
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-09-01T09:00:00.000Z",
      sections: [{ kind: "absent", title: "Objections", line: "No calls were held this month, so there are no objections to read." }],
      omissions: [],
    };
    const stored = rowToStored({
      id: "rep-1",
      org_id: "org-1",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      version: 1,
      generated_at: "2026-09-01T09:00:00.000Z",
      generated_by: "scheduled",
      generated_by_member_id: null,
      generated_by_name: "scheduled",
      source_type: "airtable",
      payload: report as unknown as Json,
      omissions: [] as unknown as Json,
    });
    expect(stored.report).toEqual(report);
    expect(stored.version).toBe(1);
  });
});
