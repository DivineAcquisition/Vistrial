import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { addDays } from "@/lib/billing/cycle";
import {
  combinedCost,
  daysInPeriod,
  lastCompleteWeek,
  missingSpendDays,
  sumAdSpend,
  sumDaFees,
} from "@/lib/portal/cpa";
import { hashToken, mintToken } from "@/lib/portal/tokens";
import { spreadAdSpend, upsertAdSpend } from "@/lib/portal/spend";
import type { LedgerDb } from "@/lib/supabase/ledger";
import { FakeDb } from "@/tests/support/fake-db";

describe("combined cost per appointment", () => {
  const period = { start: "2026-03-30", end: "2026-04-05" };

  it("is unavailable when any day has no spend row", () => {
    const result = combinedCost({
      period,
      spend: [
        { spend_date: "2026-03-30", amount: 100 },
        { spend_date: "2026-03-31", amount: 0 },
      ],
      charges: [{ period_start: "2026-03-30", period_end: "2026-04-05", total: 300, status: "paid" }],
      appointments: [
        { confirmed_on: "2026-04-01" },
        { confirmed_on: "2026-04-02" },
      ],
    });

    assert.equal(result.costPerAppointment, null);
    assert.match(result.unavailableReason ?? "", /missing/i);
    assert.ok(result.missingSpendDays.length >= 1);
  });

  it("treats an explicit zero as complete", () => {
    const spend = daysInPeriod(period.start, period.end).map((day) => ({
      spend_date: day,
      amount: day === "2026-04-01" ? 0 : 50,
    }));

    const result = combinedCost({
      period,
      spend,
      charges: [{ period_start: "2026-03-30", period_end: "2026-04-05", total: 150, status: "paid" }],
      appointments: [
        { confirmed_on: "2026-04-01" },
        { confirmed_on: "2026-04-02" },
        { confirmed_on: "2026-04-03" },
      ],
    });

    assert.equal(result.missingSpendDays.length, 0);
    assert.equal(result.adSpend, 300);
    assert.equal(result.daFees, 150);
    assert.equal(result.combined, 450);
    assert.equal(result.costPerAppointment, 150);
  });

  it("never reports zero cost when there were no appointments", () => {
    const spend = daysInPeriod(period.start, period.end).map((day) => ({
      spend_date: day,
      amount: 10,
    }));

    const result = combinedCost({
      period,
      spend,
      charges: [],
      appointments: [],
    });

    assert.equal(result.costPerAppointment, null);
    assert.match(result.unavailableReason ?? "", /No confirmed appointments/);
  });

  it("ignores draft charges when summing DA fees", () => {
    assert.equal(
      sumDaFees(period, [
        { period_start: "2026-03-30", period_end: "2026-04-05", total: 99, status: "draft" },
        { period_start: "2026-03-30", period_end: "2026-04-05", total: 200, status: "notified" },
      ]),
      200
    );
  });

  it("sums ad spend for the rows it is given", () => {
    assert.equal(
      sumAdSpend([
        { spend_date: "2026-04-01", amount: 10.5 },
        { spend_date: "2026-04-02", amount: 20.25 },
      ]),
      30.75
    );
  });

  it("lists every missing day in the period", () => {
    const missing = missingSpendDays(period, [{ spend_date: "2026-04-01", amount: 1 }]);
    assert.equal(missing.length, 6);
    assert.ok(!missing.includes("2026-04-01"));
  });
});

describe("last complete week", () => {
  it("returns the Monday–Sunday week that has already finished", () => {
    // Wednesday 2026-04-15 → previous week is Mon 6 – Sun 12 April.
    const week = lastCompleteWeek(new Date("2026-04-15T12:00:00.000Z"));
    assert.equal(week.start, "2026-04-06");
    assert.equal(week.end, "2026-04-12");
  });

  it("does not treat a Sunday still in progress as complete", () => {
    const week = lastCompleteWeek(new Date("2026-04-12T12:00:00.000Z"));
    assert.equal(week.start, "2026-03-30");
    assert.equal(week.end, "2026-04-05");
  });
});

describe("portal tokens", () => {
  it("hashes the same token to the same digest and never stores the raw value", () => {
    const token = mintToken();
    assert.notEqual(token, hashToken(token));
    assert.equal(hashToken(token), hashToken(token));
    assert.notEqual(hashToken(token), hashToken(mintToken()));
  });
});

describe("ad spend upsert and spread", () => {
  it("replaces the amount on the same day rather than stacking rows", async () => {
    const db = new FakeDb();
    const client = db.seed("clients", { name: "Northgate" });
    const ledger = db as unknown as LedgerDb;

    await upsertAdSpend(ledger, {
      clientId: String(client.id),
      spendDate: "2026-04-01",
      amount: 100,
      enteredBy: "admin",
      enteredByLabel: "admin@da.test",
    });
    await upsertAdSpend(ledger, {
      clientId: String(client.id),
      spendDate: "2026-04-01",
      amount: 40,
      enteredBy: "admin",
      enteredByLabel: "admin@da.test",
    });

    const rows = db.rows("ad_spend");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, 40);
  });

  it("spreads a total across a range with exact cents", async () => {
    const db = new FakeDb();
    const client = db.seed("clients", { name: "Northgate" });
    const ledger = db as unknown as LedgerDb;

    const rows = await spreadAdSpend(ledger, {
      clientId: String(client.id),
      start: "2026-04-01",
      end: "2026-04-03",
      total: 10,
      enteredBy: "admin",
      enteredByLabel: "admin@da.test",
    });

    assert.equal(rows.length, 3);
    const sum = rows.reduce((total, row) => total + Number(row.amount), 0);
    assert.equal(Number(sum.toFixed(2)), 10);
    assert.equal(addDays("2026-04-01", 2), "2026-04-03");
  });
});
