import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { messageHasBody, stripMessageBodies } from "@/lib/ghl/history-meta";
import { resetForsightCache } from "@/lib/forsight/cache";
import { countAppointments, countMessages, type GhlActivity } from "@/lib/forsight/ghl";
import { loadSpendToday } from "@/lib/forsight/spend-today";
import type { ForsightDb } from "@/lib/forsight/sources";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-01T09:00:00Z");

function dbWithMetaSource(): ForsightDb {
  const source = {
    id: "src-meta",
    org_id: ORG_ID,
    source_type: "meta_ads",
    status: "active",
    label: "DA ad account",
    airtable_base_id: null,
    airtable_leads_table: null,
    airtable_creatives_table: null,
    airtable_weekly_summary_table: null,
    airtable_touches_table: null,
    meta_ad_account_id: "act_1234567890",
    ghl_calendar_id: null,
    last_verified_at: null,
    last_error: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [source], error: null }).then(resolve);

  return { from: () => chain } as unknown as ForsightDb;
}

beforeEach(() => {
  resetForsightCache();
  process.env.META_ACCESS_TOKEN = "token-test";
});

afterEach(() => {
  delete process.env.META_ACCESS_TOKEN;
  vi.unstubAllGlobals();
});

/**
 * Spend today is a live Meta read sitting on a page whose other figures come
 * from Airtable. Breaking one must not break the other, so this covers the
 * failure path as deliberately as the success path.
 */
describe("spend today survives its own failure", () => {
  it("reads today's spend when Meta answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [{ spend: "128.40" }] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      )
    );

    const result = await loadSpendToday(dbWithMetaSource(), { orgId: ORG_ID, now: NOW });
    expect(result).toMatchObject({ state: "ok", date: "2026-09-01", spend: 128.4 });
  });

  it("returns unavailable rather than throwing when Meta rejects the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Invalid OAuth access token" } }), {
            status: 401,
            headers: { "content-type": "application/json" },
          })
      )
    );

    const result = await loadSpendToday(dbWithMetaSource(), { orgId: ORG_ID, now: NOW });
    expect(result.state).toBe("unavailable");
    if (result.state === "unavailable") {
      expect(result.reason).toContain("rejected the platform credential");
    }
  });

  it("returns unavailable rather than throwing when the network is gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND graph.facebook.com");
      })
    );

    const result = await loadSpendToday(dbWithMetaSource(), { orgId: ORG_ID, now: NOW });
    expect(result.state).toBe("unavailable");
  });

  it("does not cache a failure, so the next page load tries again", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient");
        return new Response(JSON.stringify({ data: [{ spend: "10" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );

    const db = dbWithMetaSource();
    expect((await loadSpendToday(db, { orgId: ORG_ID, now: NOW })).state).toBe("unavailable");
    expect((await loadSpendToday(db, { orgId: ORG_ID, now: NOW })).state).toBe("ok");
  });

  it("says nothing at all for a workspace with no Meta source", async () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    const db = { from: () => chain } as unknown as ForsightDb;

    expect((await loadSpendToday(db, { orgId: ORG_ID, now: NOW })).state).toBe("not_tracked");
  });
});

/**
 * Forsight shows counts and statuses from GoHighLevel and never a word anyone
 * wrote. The rule holds across the product; this is Forsight's own proof of it.
 */
describe("no message content reaches Forsight", () => {
  const payload = {
    id: "msg_1",
    direction: "inbound",
    messageType: "SMS",
    dateAdded: "2026-08-26T10:00:00Z",
    body: "Hey, is the audit still available on Thursday?",
    html: "<p>Hey, is the audit still available on Thursday?</p>",
    preview: "Hey, is the audit still...",
    subject: "Re: your audit",
    attachments: ["contract.pdf"],
    contact: { id: "c1", firstName: "Maria" },
  };

  it("strips every body-bearing field before Forsight ever sees a message", () => {
    expect(messageHasBody(payload)).toBe(true);
    const stripped = stripMessageBodies(payload);
    expect(messageHasBody(stripped)).toBe(false);

    const serialized = JSON.stringify(stripped);
    for (const leak of ["Thursday", "contract.pdf", "Re: your audit"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("counts a message without keeping anything a person typed", () => {
    const counts = countMessages(
      [{ direction: "inbound", channel: "sms", occurredAt: "2026-08-26T10:00:00Z" }],
      { from: "2026-08-25", to: "2026-08-31T23:59:59Z" },
      false
    );

    expect(counts.inbound).toBe(1);
    // Every value is a number or the partial flag. There is nowhere to put text.
    for (const [key, value] of Object.entries(counts)) {
      expect(typeof value).toBe(key === "partial" ? "boolean" : "number");
    }
  });

  it("carries no free text out of the GHL section beyond the calendar's name", () => {
    const activity: GhlActivity = {
      calendarLabel: "Lead Leak Audit calendar",
      appointments: countAppointments([{ outcome: "held" }, { outcome: "no_show" }]),
      messages: countMessages([], { from: "2026-08-25", to: "2026-08-31T23:59:59Z" }, false),
    };

    const strings = JSON.stringify(activity).match(/"[^"]*"/g) ?? [];
    const values = strings.filter((token) => !isKey(token, activity));
    expect(values).toEqual(['"Lead Leak Audit calendar"']);
    expect(messageHasBody(activity)).toBe(false);
  });

  it("has no unread count to show, because Forsight never asks for one", () => {
    const counts = countMessages([], { from: "2026-08-25", to: "2026-08-31T23:59:59Z" }, false);
    expect(Object.keys(counts)).toEqual([
      "outboundSms",
      "outboundEmail",
      "outboundOther",
      "inbound",
      "partial",
    ]);
  });
});

function isKey(token: string, activity: GhlActivity): boolean {
  const keys = new Set([
    "calendarLabel",
    "appointments",
    "messages",
    ...Object.keys(activity.appointments),
    ...Object.keys(activity.messages),
  ]);
  return keys.has(token.slice(1, -1));
}
