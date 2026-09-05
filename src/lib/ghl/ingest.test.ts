import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { adoptEventsForLocation, ingestGhlWebhook } from "@/lib/ghl/ingest";
import { AWAITING_LINK_ERROR } from "@/lib/ghl/retry";
import type { GhlDb } from "@/lib/ghl/tokens";

type Call = {
  table: string;
  op: "select" | "insert" | "update";
  values: Record<string, unknown> | null;
  filters: string[];
};

type Chain = {
  select: (columns?: string) => Chain;
  eq: (column: string, value: unknown) => Chain;
  is: (column: string, value: unknown) => Chain;
  not: (column: string, operator: string, value: unknown) => Chain;
  or: (expression: string) => Chain;
  order: (column: string, options?: unknown) => Chain;
  limit: (count: number) => Chain;
  maybeSingle: () => Promise<unknown>;
  then: (onFulfilled: (value: unknown) => unknown) => Promise<unknown>;
};

/**
 * Minimal PostgREST-shaped stub. It records what the ingest path asked the
 * database to do so the tests can assert on the row and the filters rather
 * than on a mock's call count.
 */
function stubDb(results: Record<string, unknown>) {
  const calls: Call[] = [];

  function chain(call: Call): Chain {
    const key = `${call.op}:${call.table}`;
    const settle = () => results[key] ?? { data: null, error: null };
    const self: Chain = {
      select: () => self,
      eq: (column, value) => {
        call.filters.push(`eq:${column}=${String(value)}`);
        return self;
      },
      is: (column, value) => {
        call.filters.push(`is:${column}=${String(value)}`);
        return self;
      },
      not: (column, operator, value) => {
        call.filters.push(`not:${column}.${operator}=${String(value)}`);
        return self;
      },
      or: (expression) => {
        call.filters.push(`or:${expression}`);
        return self;
      },
      order: () => self,
      limit: () => self,
      maybeSingle: async () => settle(),
      then: (onFulfilled) => Promise.resolve(settle()).then(onFulfilled),
    };
    return self;
  }

  const db = {
    from(table: string) {
      return {
        select(columns?: string) {
          const call: Call = { table, op: "select", values: null, filters: [] };
          calls.push(call);
          void columns;
          return chain(call);
        },
        insert(values: Record<string, unknown>) {
          const call: Call = { table, op: "insert", values, filters: [] };
          calls.push(call);
          return chain(call);
        },
        update(values: Record<string, unknown>) {
          const call: Call = { table, op: "update", values, filters: [] };
          calls.push(call);
          return chain(call);
        },
      };
    },
  };

  return {
    db: db as unknown as GhlDb,
    calls,
    find(op: Call["op"], table: string) {
      return calls.find((call) => call.op === op && call.table === table);
    },
  };
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function signed(body: Record<string, unknown>) {
  const rawBody = JSON.stringify(body);
  return {
    rawBody,
    ghlSignature: sign(null, Buffer.from(rawBody), privateKey).toString("base64"),
    legacySignature: null,
  };
}

describe("ingesting an event from an unlinked location", () => {
  const previousKey = process.env.GHL_WEBHOOK_ED25519_PUBLIC_KEY;

  beforeEach(() => {
    process.env.GHL_WEBHOOK_ED25519_PUBLIC_KEY = publicPem;
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.GHL_WEBHOOK_ED25519_PUBLIC_KEY;
    else process.env.GHL_WEBHOOK_ED25519_PUBLIC_KEY = previousKey;
  });

  it("stores a null org and still records which location it came from", async () => {
    const stub = stubDb({
      "select:organizations": { data: null, error: null },
      "insert:webhook_events": { data: { id: "evt-1" }, error: null },
    });

    const result = await ingestGhlWebhook(
      stub.db,
      signed({ type: "ContactCreate", webhookId: "wh-1", locationId: "loc-unclaimed", contactId: "ct-1" })
    );

    expect(result.httpStatus).toBe(200);
    const insert = stub.find("insert", "webhook_events");
    expect(insert?.values?.org_id).toBeNull();
    // Without this the row is unattributable, so linking the location later
    // cannot find the leads that arrived while nobody owned it.
    expect(insert?.values?.location_id).toBe("loc-unclaimed");
  });

  it("rejects a bad signature before touching the payload", async () => {
    const stub = stubDb({ "insert:webhook_events": { data: null, error: null } });
    const result = await ingestGhlWebhook(stub.db, {
      rawBody: JSON.stringify({ type: "ContactCreate", locationId: "loc-1" }),
      ghlSignature: "not-a-signature",
      legacySignature: null,
    });

    expect(result).toEqual({ httpStatus: 401, reason: "invalid" });
    const recorded = stub.find("insert", "webhook_events");
    expect(recorded?.values?.event_type).toBe("rejected.invalid");
    expect(JSON.stringify(recorded?.values)).not.toContain("loc-1");
  });

  it("never throttles a signed event", async () => {
    const stub = stubDb({
      "select:organizations": { data: { id: "org-1" }, error: null },
      "insert:webhook_events": { data: { id: "evt-1" }, error: null },
    });
    let throttleConsulted = false;

    const result = await ingestGhlWebhook(stub.db, {
      ...signed({ type: "ContactCreate", webhookId: "wh-2", locationId: "loc-1", contactId: "ct-1" }),
      allowRejectionRecord: async () => {
        throttleConsulted = true;
        return false;
      },
    });

    expect(result.httpStatus).toBe(200);
    // A 429 stores nothing. Once GHL exhausts its retries, that lead is gone.
    expect(throttleConsulted).toBe(false);
    expect(stub.find("insert", "webhook_events")?.values?.provider_event_id).toBe("wh-2");
  });

  it("throttles only the rejection record for forged traffic", async () => {
    const stub = stubDb({ "insert:webhook_events": { data: null, error: null } });
    const result = await ingestGhlWebhook(stub.db, {
      rawBody: "{}",
      ghlSignature: null,
      legacySignature: null,
      allowRejectionRecord: async () => false,
    });

    expect(result).toEqual({ httpStatus: 401, reason: "missing" });
    expect(stub.find("insert", "webhook_events")).toBeUndefined();
  });
});

describe("adopting a location's backlog", () => {
  it("claims unowned events for the location and revives the ones that gave up waiting", async () => {
    const stub = stubDb({
      "update:webhook_events": { data: [{ id: "evt-1" }, { id: "evt-2" }], error: null },
    });

    const adopted = await adoptEventsForLocation(stub.db, "org-1", "loc-1");

    expect(adopted).toBe(2);
    const update = stub.find("update", "webhook_events");
    expect(update?.values).toMatchObject({
      org_id: "org-1",
      status: "pending",
      processed: false,
      attempt_count: 0,
      error_text: null,
    });
    expect(update?.filters).toContain("is:org_id=null");
    expect(update?.filters).toContain("eq:location_id=loc-1");
    const or = update?.filters.find((filter) => filter.startsWith("or:")) ?? "";
    expect(or).toContain("status.eq.pending");
    expect(or).toContain(AWAITING_LINK_ERROR);
  });

  it("re-arms the adopted events for immediate processing", async () => {
    const stub = stubDb({ "update:webhook_events": { data: [{ id: "evt-1" }], error: null } });
    await adoptEventsForLocation(stub.db, "org-1", "loc-1");
    const next = stub.find("update", "webhook_events")?.values?.next_attempt_at;
    expect(Date.parse(String(next))).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
