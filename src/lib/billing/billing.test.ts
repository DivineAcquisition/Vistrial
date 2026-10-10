import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatPlanPrice, limitLabel } from "@/lib/billing/labels";
import { readPlanMetadata } from "@/lib/billing/stripe";
import { fakeDb } from "@/lib/inbound/fake-db";

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const SECRET = "whsec_billing_test";

vi.mock("@/lib/ops/alerts", () => ({ recordHttpSample: async () => undefined }));
vi.mock("@/lib/ops/rate-limit", () => ({ rateLimitWebhook: async () => ({ allowed: true }) }));
const notices = vi.fn();
const staffMail = vi.fn();
vi.mock("@/lib/portal/notices", () => ({
  queuePortalNotice: (...args: unknown[]) => notices(...args),
  emailStaff: (...args: unknown[]) => staffMail(...args),
}));
let current: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => current.db }));

function signed(event: Record<string, unknown>, secret = SECRET) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return new Request("https://app.vistrial.io/api/webhooks/stripe-billing", {
    method: "POST",
    body,
    headers: { "stripe-signature": `t=${t},v1=${v1}` },
  });
}

describe("Plan labels", () => {
  it("formats prices from Stripe's smallest unit", () => {
    expect(formatPlanPrice(49_900, "usd", "month", 1)).toBe("$499 a month");
    expect(formatPlanPrice(12_550, "usd", "month", 3)).toBe("$125.50 every 3 months");
    expect(formatPlanPrice(100_000, "usd", null, null)).toBe("$1,000");
    expect(limitLabel("active_seats")).toBe("active seats");
  });

  it("reads limits and features only from product metadata", () => {
    expect(readPlanMetadata({ limit_seats: "5", limit_bad: "x", features: "Sentry | Relay\nScribe", other: "1" })).toEqual({
      limits: { seats: 5 },
      features: ["Sentry", "Relay", "Scribe"],
    });
    expect(readPlanMetadata({})).toEqual({ limits: {}, features: [] });
  });
});

describe("Billing webhook", () => {
  beforeEach(() => {
    notices.mockReset();
    staffMail.mockReset();
    process.env.STRIPE_BILLING_WEBHOOK_SECRET = SECRET;
    delete process.env.STRIPE_SECRET_KEY;
  });
  afterEach(() => {
    delete process.env.STRIPE_BILLING_WEBHOOK_SECRET;
  });

  it("refuses a bad signature and writes nothing", async () => {
    current = fakeDb({ workspace_billing: [{ org_id: ORG_A, stripe_customer_id: "cus_aaaaaaaa", payment_failed_at: null }] });
    const { POST } = await import("@/app/api/webhooks/stripe-billing/route");
    const response = await POST(signed({ id: "evt_1", type: "invoice.payment_failed" }, "whsec_wrong"));
    expect(response.status).toBe(401);
    expect(current.writes).toHaveLength(0);
  });

  it("holds events for a customer no workspace is linked to", async () => {
    current = fakeDb({ workspace_billing: [{ org_id: ORG_A, stripe_customer_id: "cus_aaaaaaaa", payment_failed_at: null }] });
    const { POST } = await import("@/app/api/webhooks/stripe-billing/route");
    const response = await POST(
      signed({ id: "evt_2", type: "invoice.payment_failed", data: { object: { customer: "cus_unknown1" } } })
    );
    expect(await response.json()).toEqual({ ok: true, held: true });
    expect(current.writes).toEqual([
      expect.objectContaining({
        table: "inbound_event_holds",
        values: expect.objectContaining({ source: "stripe_billing", reason: "unmatched", routing_key: "cus_unknown1" }),
      }),
    ]);
  });

  it("marks only the linked workspace when a payment fails, and switches nothing off", async () => {
    current = fakeDb({
      workspace_billing: [
        { org_id: ORG_A, stripe_customer_id: "cus_aaaaaaaa", payment_failed_at: null },
        { org_id: ORG_B, stripe_customer_id: "cus_bbbbbbbb", payment_failed_at: null },
      ],
    });
    const { POST } = await import("@/app/api/webhooks/stripe-billing/route");
    const response = await POST(
      signed({ id: "evt_3", type: "invoice.payment_failed", data: { object: { customer: "cus_aaaaaaaa" } } })
    );
    expect(await response.json()).toEqual({ ok: true, applied: true });
    expect(current.writes.map((write) => write.table)).toEqual(["workspace_billing"]);
    expect(current.writes[0]?.values).toMatchObject({ last_invoice_status: "open" });
    expect(JSON.stringify(current.writes)).not.toContain(ORG_B);
    expect(current.writes.some((write) => write.table === "organizations")).toBe(false);
  });

  it("ignores event types it does not use", async () => {
    current = fakeDb({ workspace_billing: [] });
    const { POST } = await import("@/app/api/webhooks/stripe-billing/route");
    const response = await POST(signed({ id: "evt_4", type: "charge.succeeded", data: { object: { customer: "cus_aaaaaaaa" } } }));
    expect(await response.json()).toEqual({ ok: true, applied: false });
    expect(current.writes).toHaveLength(0);
  });
});
