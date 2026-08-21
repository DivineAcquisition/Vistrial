import { describe, expect, it } from "vitest";

import { buildClientSummary, summaryOverstates } from "@/lib/reporting/summary";
import { parseReportingRange } from "@/lib/reporting/range";
import { truncRate } from "@/lib/reporting/format";
import { messageHasBody, stripMessageBodies } from "@/lib/ghl/history-meta";

describe("client summary", () => {
  it("says so when nothing improved", () => {
    const text = buildClientSummary({
      outcome: {
        headline: { k: 8, n: 40, per_hundred: 20, too_small: false, sample_label: "8 of 40" },
        baseline: { k: 10, n: 40, per_hundred: 25, too_small: false, sample_label: "10 of 40" },
        comparison: { shown: true, from: "backfilled", delta_per_hundred: -5, improved: false },
        attribution: "Vistrial did not close these deals. The client's team did.",
      },
      coverage: { ever_touched: { k: 30, n: 40, pct: 75, too_small: false } },
      sources: {},
      terminal: { too_small: true, suppressed_plain: "Not enough terminal outcomes." },
      speed: { too_small: true },
    });
    expect(text).toContain("did not improve");
    expect(summaryOverstates(text)).toBe(false);
  });

  it("labels self-reported figures and does not blend them", () => {
    const text = buildClientSummary({
      outcome: {
        headline: { k: 8, n: 40, per_hundred: 20, too_small: false, sample_label: "8 of 40" },
        comparison: { shown: false, plain: "No pre-activation comparison is shown." },
        self_reported: { leads_per_month: 50, clients_closed_per_month: 3, label: "self-reported" },
      },
      coverage: {},
      sources: {},
      terminal: {},
      speed: {},
    });
    expect(text).toContain("self-reported");
    expect(text).toContain("not blended");
  });
});

describe("range parsing", () => {
  it("clamps custom ranges to activation", () => {
    const range = parseReportingRange(
      { range: "custom", from: "2020-01-01", to: "2026-08-01" },
      "2026-05-01T00:00:00.000Z"
    );
    expect(range.from).toBe("2026-05-01T00:00:00.000Z");
    expect(range.key).toBe("custom");
  });
});

describe("unflattering truncation", () => {
  it("never rounds a rate up", () => {
    expect(truncRate(6.49, 1)).toBe(6.4);
  });

  it("does not round a negative delta toward zero", () => {
    const factor = 10;
    const delta = -2.51;
    const unflattering = -(Math.ceil(Math.abs(delta) * factor) / factor);
    expect(unflattering).toBe(-2.6);
  });
});

describe("summary overclaim filter", () => {
  it("blocks copy that credits Vistrial with a close", () => {
    expect(summaryOverstates("Vistrial closed 8 more clients this quarter.")).toBe(true);
    expect(summaryOverstates("The client's team closed 8 of 40 leads.")).toBe(false);
  });
});

describe("backfill message metadata", () => {
  it("strips bodies and nested message text", () => {
    const stripped = stripMessageBodies({
      id: "m1",
      direction: "outbound",
      body: "Hi there please buy",
      html: "<p>Hi</p>",
      userId: "u1",
      nested: { message: "secret", type: "SMS" },
    }) as Record<string, unknown>;
    expect(stripped.id).toBe("m1");
    expect(stripped.body).toBeUndefined();
    expect(stripped.html).toBeUndefined();
    expect((stripped.nested as Record<string, unknown>).message).toBeUndefined();
    expect((stripped.nested as Record<string, unknown>).type).toBe("SMS");
    expect(messageHasBody({ body: "x" })).toBe(true);
    expect(messageHasBody(stripped)).toBe(false);
  });
});
