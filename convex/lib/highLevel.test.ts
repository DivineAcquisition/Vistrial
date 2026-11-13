import { describe, expect, it } from "vitest";

import {
  changesSince,
  HL_SCOPES,
  hlErrorCode,
  installUrl,
  keepDeal,
  messagesOf,
  parseContact,
  parseDeal,
  parseEvent,
  parseMessage,
  parsePipelines,
  parseTime,
  pauseAfter,
  summarize,
  verifyWebhook,
  type Deal,
} from "./highLevel";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const DAY = 86_400_000;

function deal(over: Partial<Deal> = {}): Deal {
  return {
    externalId: "opp1",
    pipelineId: "pipe1",
    stageId: "stageA",
    status: "open",
    value: 1000,
    source: "Facebook",
    contactId: "cont1",
    assignedTo: null,
    createdAt: NOW - 10 * DAY,
    updatedAt: NOW - DAY,
    lastStageChangeAt: NOW - DAY,
    lastStatusChangeAt: null,
    ...over,
  };
}

describe("HighLevel helpers", () => {
  it("asks only for read scopes, at HighLevel's install page, with the state", () => {
    expect(HL_SCOPES.every((scope) => scope.endsWith(".readonly"))).toBe(true);
    const url = new URL(installUrl({ clientId: "app-id", redirectUri: "https://x.convex.site/crm/hl/callback", state: "abc" }));
    expect(url.origin).toBe("https://marketplace.gohighlevel.com");
    expect(url.pathname).toBe("/oauth/chooselocation");
    expect(url.searchParams.get("scope")).toBe(HL_SCOPES.join(" "));
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("redirect_uri")).not.toMatch(/highlevel/i);
  });

  it("turns answers into short codes", () => {
    expect(hlErrorCode(401)).toBe("token_rejected");
    expect(hlErrorCode(403)).toBe("permission_missing");
    expect(hlErrorCode(429)).toBe("rate_limited");
    expect(hlErrorCode(422)).toBe("bad_request");
    expect(hlErrorCode(503)).toBe("provider_down");
  });

  it("reads times in every form HighLevel sends", () => {
    expect(parseTime("2026-11-13T12:00:00Z")).toBe(NOW);
    expect(parseTime(NOW)).toBe(NOW);
    expect(parseTime(String(NOW))).toBe(NOW);
    expect(parseTime("")).toBeNull();
    expect(parseTime(null)).toBeNull();
  });

  it("slows down when the burst window is nearly used", () => {
    expect(pauseAfter(new Headers({ "x-ratelimit-remaining": "50" }), 150)).toBe(150);
    expect(pauseAfter(new Headers({ "x-ratelimit-remaining": "3" }), 150)).toBe(10_000);
    expect(pauseAfter(new Headers(), 150)).toBe(150);
  });

  it("keeps a deal without its name, and its contact's name, email and phone only", () => {
    const parsed = parseDeal({
      id: "opp1",
      name: "Jane Doe - kitchen remodel",
      pipelineId: "pipe1",
      pipelineStageId: "stageA",
      status: "won",
      monetaryValue: "2500",
      source: "Google Ads",
      contactId: "cont1",
      notes: ["private"],
      customFields: [{ id: "x", value: "secret" }],
      contact: { id: "cont1", name: "Jane Doe", email: "JANE@EXAMPLE.COM", phone: "+15551234567", tags: ["hot"], address1: "1 Main St" },
      lastStatusChangeAt: "2026-11-10T00:00:00Z",
    });
    expect(parsed?.deal).toMatchObject({ externalId: "opp1", status: "won", value: 2500, source: "Google Ads" });
    expect(JSON.stringify(parsed)).not.toContain("kitchen");
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(JSON.stringify(parsed)).not.toContain("Main St");
    expect(parsed?.contact).toEqual({ externalId: "cont1", name: "Jane Doe", email: "jane@example.com", phone: "+15551234567", tags: ["hot"] });
    expect(parseDeal({ id: "x" })).toBeNull();
  });

  it("keeps open deals and deals touched in the last year", () => {
    expect(keepDeal(deal({ status: "open", updatedAt: NOW - 900 * DAY }), NOW)).toBe(true);
    expect(keepDeal(deal({ status: "lost", updatedAt: NOW - 400 * DAY, createdAt: NOW - 500 * DAY }), NOW)).toBe(false);
    expect(keepDeal(deal({ status: "won", updatedAt: NOW - 30 * DAY }), NOW)).toBe(true);
  });

  it("keeps contact facts and drops everything else", () => {
    const contact = parseContact({ id: "c1", firstName: "Sam", lastName: "Lee", email: "sam@x.co", phone: "+1555", source: "Website form", tags: Array.from({ length: 20 }, (_, i) => `t${i}`), dateAdded: "2026-11-01T00:00:00Z", dateOfBirth: "1990-01-01", address1: "2 High St" });
    expect(contact).toMatchObject({ name: "Sam Lee", email: "sam@x.co", source: "Website form" });
    expect(contact?.tags).toHaveLength(10);
    expect(JSON.stringify(contact)).not.toContain("1990");
    expect(JSON.stringify(contact)).not.toContain("High St");
  });

  it("records what a message was, never what it said", () => {
    const row = parseMessage({ id: "m1", messageType: "TYPE_CALL", direction: "outbound", dateAdded: "2026-11-12T00:00:00Z", contactId: "c1", body: "SECRET BODY", meta: { call: { duration: 95, status: "completed" } }, attachments: ["https://x/rec.mp3"] });
    expect(row).toMatchObject({ kind: "call", direction: "outbound", seconds: 95, status: "completed", contactId: "c1" });
    expect(JSON.stringify(row)).not.toContain("SECRET");
    expect(JSON.stringify(row)).not.toContain("rec.mp3");
    expect(parseMessage({ id: "m2", messageType: "TYPE_INTERNAL_COMMENT", dateAdded: "2026-11-12T00:00:00Z" })).toBeNull();
    expect(messagesOf({ messages: { messages: [{ id: "a" }], nextPage: true, lastMessageId: "abcd" } })).toEqual({ rows: [{ id: "a" }], next: "abcd" });
    expect(messagesOf({ messages: [{ id: "a" }] }).rows).toHaveLength(1);
  });

  it("reads appointments with their status, without notes", () => {
    const row = parseEvent({ id: "e1", startTime: "2026-11-14T15:00:00Z", appointmentStatus: "showed", contactId: "c1", notes: "private note", title: "Call with Jane" });
    expect(row).toMatchObject({ kind: "appointment", status: "showed" });
    expect(JSON.stringify(row)).not.toContain("private");
    expect(JSON.stringify(row)).not.toContain("Jane");
  });

  it("orders pipeline stages", () => {
    const [pipe] = parsePipelines({ pipelines: [{ id: "pipe1", name: "Sales", stages: [{ id: "s2", name: "Booked", position: 1 }, { id: "s1", name: "New", position: 0 }] }] });
    expect(pipe.stages.map((stage) => stage.name)).toEqual(["New", "Booked"]);
  });

  it("finds stage and status changes between reads, not new deals", () => {
    const previous = new Map([["opp1", { stageId: "stageA", status: "open" }]]);
    const moved = changesSince(previous, [deal({ stageId: "stageB", status: "won", lastStatusChangeAt: NOW }), deal({ externalId: "new" })], NOW);
    expect(moved.map((row) => row.kind)).toEqual(["stage_change", "status_change"]);
    expect(moved[0]).toMatchObject({ fromStage: "stageA", toStage: "stageB", dealId: "opp1" });
  });

  it("adds up pipelines, won revenue, sources and activity in code", () => {
    const summary = summarize({
      currency: "USD",
      pipelines: [{ externalId: "pipe1", name: "Sales", stages: [{ id: "stageA", name: "New", position: 0 }] }],
      deals: [
        deal(),
        deal({ externalId: "w1", status: "won", value: 3000, lastStatusChangeAt: NOW - 5 * DAY }),
        deal({ externalId: "w2", status: "won", value: 2000, lastStatusChangeAt: NOW - 60 * DAY, source: "Referral" }),
        deal({ externalId: "l1", status: "lost", lastStatusChangeAt: NOW - 10 * DAY }),
      ],
      contacts: [{ externalId: "cont1", name: "A", email: null, phone: null, source: "Facebook", tags: [], addedAt: NOW - 3 * DAY }],
      activities: [
        { externalId: "a1", kind: "call", direction: "outbound", at: NOW - DAY, contactId: null, dealId: null, status: null, seconds: 60, fromStage: null, toStage: null },
        { externalId: "a2", kind: "sms", direction: "inbound", at: NOW - DAY, contactId: null, dealId: null, status: null, seconds: null, fromStage: null, toStage: null },
        { externalId: "a3", kind: "call", direction: "outbound", at: NOW - 60 * DAY, contactId: null, dealId: null, status: null, seconds: 60, fromStage: null, toStage: null },
      ],
      now: NOW,
    });
    expect(summary.open).toEqual({ count: 1, value: 1000 });
    expect(summary.won.d30).toEqual({ count: 1, value: 3000 });
    expect(summary.won.d90).toEqual({ count: 2, value: 5000 });
    expect(summary.winRate90).toBeCloseTo(2 / 3);
    expect(summary.pipelines[0].stages[0]).toMatchObject({ open: 1, value: 1000 });
    expect(summary.activity30).toMatchObject({ calls: 1, messages: 1, inbound: 1, outbound: 1 });
    expect(summary.sources.find((row) => row.source === "Facebook")).toMatchObject({ leads: 1, won: 1, value: 3000 });
    expect(summary.leads30).toBe(1);
  });

  it("verifies an Ed25519 webhook signature and refuses anything else", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    const publicKey = btoa(String.fromCharCode(...spki));
    const body = JSON.stringify({ type: "UNINSTALL", locationId: "loc12345" });
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new TextEncoder().encode(body)))));
    expect(await verifyWebhook(body, signature, publicKey)).toBe(true);
    expect(await verifyWebhook(body.replace("loc12345", "loc99999"), signature, publicKey)).toBe(false);
    expect(await verifyWebhook(body, null, publicKey)).toBe(false);
    expect(await verifyWebhook(body, "bm90IGEgc2lnbmF0dXJl", publicKey)).toBe(false);
    // HighLevel's own key cannot have signed a test body.
    expect(await verifyWebhook(body, signature)).toBe(false);
  });
});
