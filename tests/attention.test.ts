import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collapseRows,
  compareItems,
  formatAge,
  isEscalated,
  sortItems,
} from "@/lib/attention/rank";
import { composeDigest } from "@/lib/attention/digest";
import type { AttentionItem } from "@/lib/attention/types";
import { COLLAPSE_AT, TYPE_PRIORITY } from "@/lib/attention/types";

function make(
  overrides: Partial<AttentionItem> & Pick<AttentionItem, "id" | "type">
): AttentionItem {
  return {
    clientId: "c1",
    clientName: "Northgate",
    since: "2026-04-01T00:00:00.000Z",
    ageMs: 0,
    escalated: false,
    summary: "summary",
    detail: "detail",
    valueAtRisk: 0,
    actions: [],
    ...overrides,
  };
}

describe("attention ordering", () => {
  it("ranks failed payments above everything else", () => {
    const items = sortItems([
      make({ id: "1", type: "cycle_skipped", ageMs: 999999 }),
      make({ id: "2", type: "failed_payment", ageMs: 1000, escalated: true }),
      make({ id: "3", type: "awaiting_human_touch", ageMs: 50000 }),
    ]);

    assert.equal(items[0].type, "failed_payment");
    assert.ok(TYPE_PRIORITY.failed_payment < TYPE_PRIORITY.awaiting_human_touch);
    assert.ok(TYPE_PRIORITY.awaiting_human_touch < TYPE_PRIORITY.no_payment_method);
  });

  it("puts escalated items above non-escalated within a band", () => {
    const newerEscalated = make({
      id: "a",
      type: "open_dispute",
      ageMs: 25 * 60 * 60 * 1000,
      escalated: true,
    });
    const olderCalm = make({
      id: "b",
      type: "open_dispute",
      ageMs: 2 * 60 * 60 * 1000,
      escalated: false,
    });

    assert.ok(compareItems(newerEscalated, olderCalm) < 0);
  });

  it("escalates failed payments immediately and leads after four hours", () => {
    assert.equal(isEscalated("failed_payment", 1), true);
    assert.equal(isEscalated("awaiting_human_touch", 3 * 60 * 60 * 1000), false);
    assert.equal(isEscalated("awaiting_human_touch", 5 * 60 * 60 * 1000), true);
    assert.equal(isEscalated("open_dispute", 23 * 60 * 60 * 1000), false);
    assert.equal(isEscalated("pending_confirmation", 49 * 60 * 60 * 1000), true);
  });
});

describe("attention collapse", () => {
  it("collapses a type once it reaches the threshold", () => {
    const items = Array.from({ length: COLLAPSE_AT }, (_, index) =>
      make({
        id: `f${index}`,
        type: "failed_payment",
        ageMs: (index + 1) * 1000,
        escalated: true,
      })
    );

    const rows = collapseRows(items);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, "group");
    if (rows[0].kind === "group") {
      assert.equal(rows[0].count, COLLAPSE_AT);
      assert.equal(rows[0].oldestAgeMs, COLLAPSE_AT * 1000);
    }
  });

  it("keeps fewer than the threshold as individual rows", () => {
    const rows = collapseRows([
      make({ id: "1", type: "failed_payment", escalated: true, ageMs: 10 }),
      make({ id: "2", type: "failed_payment", escalated: true, ageMs: 20 }),
    ]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.kind === "item"));
  });
});

describe("attention age display", () => {
  it("uses hours under a day and days thereafter", () => {
    assert.equal(formatAge(30 * 60 * 1000), "30m");
    assert.equal(formatAge(5 * 60 * 60 * 1000), "5h");
    assert.equal(formatAge(3 * 24 * 60 * 60 * 1000), "3d");
  });
});

describe("attention digest composition", () => {
  it("totals failed-payment value at risk and lists escalated items", () => {
    const { subject, body, valueAtRisk, escalated } = composeDigest({
      date: "2026-04-15",
      items: [
        make({
          id: "1",
          type: "failed_payment",
          valueAtRisk: 450,
          escalated: true,
          summary: "$450 · attempt 2",
        }),
        make({
          id: "2",
          type: "open_dispute",
          valueAtRisk: 150,
          escalated: false,
        }),
      ],
    });

    assert.equal(valueAtRisk, 600);
    assert.equal(escalated, 1);
    assert.match(subject, /2 items/);
    assert.match(body, /Failed payment: 1/);
    assert.match(body, /\$450/);
  });
});
