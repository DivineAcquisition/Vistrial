import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeDb } from "@/lib/inbound/fake-db";

/**
 * The isolation check on the two live inbound sources: CRM (GoHighLevel) and
 * Stripe Connect revenue. An event is applied only when it matches exactly one
 * open workspace; otherwise it lands in the holding area and nothing else is written.
 */

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const EVENT_ID = "00000000-0000-4000-8000-0000000000e1";

function crmEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    org_id: ORG_A,
    event_type: "ContactCreate",
    location_id: "loc_1",
    payload: { locationId: "loc_1", id: "contact_1" },
    attempt_count: 0,
    received_at: new Date().toISOString(),
    provider_event_id: "p1",
    ...overrides,
  } as never;
}

describe("CRM events", () => {
  it.each([
    ["paused", "workspace_paused"],
    ["closed", "workspace_closed"],
  ])("are held for a %s workspace and nothing is applied", async (status, reason) => {
    const { processOneEvent } = await import("@/lib/ghl/process");
    const { db, writes } = fakeDb({ organizations: [{ id: ORG_A, status }] });
    await processOneEvent(db, crmEvent());
    expect(writes.map((w) => w.table).sort()).toEqual(["inbound_event_holds", "webhook_events"]);
    expect(writes.find((w) => w.table === "inbound_event_holds")?.values).toMatchObject({
      source: "crm",
      reason,
      org_id: ORG_A,
      external_ref: `webhook_event:${EVENT_ID}`,
    });
    expect(writes.find((w) => w.table === "webhook_events")?.values).toMatchObject({
      status: "rejected",
      error_text: reason,
    });
  });

  it("are held as unmatched when no workspace has the location, and keep waiting", async () => {
    const { processOneEvent } = await import("@/lib/ghl/process");
    const { db, writes } = fakeDb({ organizations: [] });
    await expect(processOneEvent(db, crmEvent({ org_id: null }))).rejects.toThrow("awaiting_location_link");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: "inbound_event_holds",
      values: { source: "crm", reason: "unmatched", org_id: null, routing_key: "loc_1" },
    });
  });

  it("never touch another workspace's rows when held", async () => {
    const { processOneEvent } = await import("@/lib/ghl/process");
    const { db, writes } = fakeDb({
      organizations: [
        { id: ORG_A, status: "paused" },
        { id: ORG_B, status: "active" },
      ],
    });
    await processOneEvent(db, crmEvent());
    expect(writes.some((w) => JSON.stringify(w.values).includes(ORG_B))).toBe(false);
  });
});

const ingest = vi.fn();
vi.mock("@/lib/sources/processor", async (original) => ({
  ...(await original<typeof import("@/lib/sources/processor")>()),
  ingestProcessorEvent: (...args: unknown[]) => ingest(...args),
}));
vi.mock("@/lib/ops/alerts", () => ({ recordHttpSample: async () => undefined }));
vi.mock("@/lib/ops/rate-limit", () => ({ rateLimitWebhook: async () => ({ allowed: true }) }));
let current: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => current.db }));

const SECRET = "whsec_test";

function stripeRequest(account: string) {
  const body = JSON.stringify({
    id: "evt_1",
    type: "charge.succeeded",
    account,
    data: { object: { id: "ch_1", amount: 5000, currency: "usd", created: 1_700_000_000 } },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return new Request("https://app.vistrial.io/api/sources/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": `t=${t},v1=${v1}` },
  });
}

function stripeConnection(orgId: string, accountId: string) {
  return { org_id: orgId, kind: "stripe", status: "active", metadata: { account_id: accountId } };
}

describe("Stripe revenue events", () => {
  beforeEach(() => {
    ingest.mockReset();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("are recorded against the one open workspace with that account", async () => {
    current = fakeDb({
      organizations: [{ id: ORG_A, status: "active" }],
      source_connections: [stripeConnection(ORG_A, "acct_1")],
    });
    const { POST } = await import("@/app/api/sources/webhooks/stripe/route");
    const response = await POST(stripeRequest("acct_1"));
    expect(await response.json()).toEqual({ ok: true });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0][1]).toMatchObject({ orgId: ORG_A, amountCents: 5000 });
    expect(current.writes.filter((w) => w.table === "inbound_event_holds")).toHaveLength(0);
  });

  it.each([
    ["unknown account", [], [], "unmatched"],
    [
      "account connected to two workspaces",
      [stripeConnection(ORG_A, "acct_1"), stripeConnection(ORG_B, "acct_1")],
      [{ id: ORG_A, status: "active" }, { id: ORG_B, status: "active" }],
      "ambiguous",
    ],
    ["paused workspace", [stripeConnection(ORG_A, "acct_1")], [{ id: ORG_A, status: "paused" }], "workspace_paused"],
    ["closed workspace", [stripeConnection(ORG_A, "acct_1")], [{ id: ORG_A, status: "closed" }], "workspace_closed"],
  ])("are held, never recorded, for an %s", async (_label, connections, organizations, reason) => {
    current = fakeDb({ organizations, source_connections: connections });
    const { POST } = await import("@/app/api/sources/webhooks/stripe/route");
    const response = await POST(stripeRequest("acct_1"));
    expect(await response.json()).toEqual({ ok: true, held: true });
    expect(ingest).not.toHaveBeenCalled();
    expect(current.writes).toEqual([
      expect.objectContaining({
        table: "inbound_event_holds",
        values: expect.objectContaining({ source: "stripe_connect", reason, external_ref: "evt_1" }),
      }),
    ]);
  });
});

describe("Sources that are not plugged in", () => {
  it.each([
    ["telnyx", "@/app/api/webhooks/telnyx/route", { data: { id: "tx_1", event_type: "message.received" } }, "tx_1"],
    ["stripe_billing", "@/app/api/webhooks/stripe-billing/route", { id: "evt_b1", type: "invoice.paid" }, "evt_b1"],
  ])("%s events are stored with source_not_enabled and nothing else", async (source, path, body, ref) => {
    current = fakeDb({ organizations: [{ id: ORG_A, status: "active" }] });
    const { POST } = (await import(path)) as { POST: (request: Request) => Promise<Response> };
    const response = await POST(new Request("https://app.vistrial.io/x", { method: "POST", body: JSON.stringify(body) }));
    expect(await response.json()).toEqual({ ok: true, held: true, enabled: false });
    expect(current.writes).toEqual([
      expect.objectContaining({
        table: "inbound_event_holds",
        values: expect.objectContaining({ source, reason: "source_not_enabled", external_ref: ref, org_id: null }),
      }),
    ]);
  });

  it("refuses oversized bodies unread", async () => {
    current = fakeDb({});
    const { POST } = await import("@/app/api/webhooks/telnyx/route");
    const response = await POST(
      new Request("https://app.vistrial.io/x", { method: "POST", body: "x".repeat(300 * 1024) })
    );
    expect(response.status).toBe(413);
    expect(current.writes).toHaveLength(0);
  });
});
