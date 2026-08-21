import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "@/lib/ghl/crypto";
import { INGEST_STALE_PENDING_MS, LOCATION_CLAIMED_MESSAGE, WEBHOOK_MAX_ATTEMPTS } from "@/lib/ghl/constants";
import { normalizeEventKind } from "@/lib/ghl/events";
import { applyGhlFieldMaps, answersEqual, mergeAnswers } from "@/lib/ghl/field-map";
import { isIngestionStale } from "@/lib/ghl/health";
import {
  contactIsSuppressed,
  inboundTouchSummary,
  isAutomationOutbound,
  mapAppointmentOutcome,
  mapMessageChannel,
  outboundTouchSummary,
} from "@/lib/ghl/message-meta";
import { hashRawBody, parseWebhookPayload } from "@/lib/ghl/payload";
import { redactForLog } from "@/lib/ghl/redact";
import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import { verifyGhlWebhookSignature } from "@/lib/ghl/signature";
import { tokensNeedRefresh } from "@/lib/ghl/tokens";

describe("token encryption", () => {
  it("round-trips and does not reuse the ciphertext", () => {
    const key = Buffer.from("a".repeat(64), "hex");
    const first = encryptSecret("super-secret-token", key);
    const second = encryptSecret("super-secret-token", key);
    expect(decryptSecret(first, key)).toBe("super-secret-token");
    expect(first).not.toBe(second);
    expect(first).not.toContain("super-secret-token");
  });
});

describe("webhook signatures", () => {
  it("accepts a valid Ed25519 signature over the raw body", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const rawBody = '{"type":"ContactCreate","webhookId":"abc"}';
    const signature = sign(null, Buffer.from(rawBody), privateKey).toString("base64");
    const result = verifyGhlWebhookSignature({
      rawBody,
      ghlSignature: signature,
      legacySignature: null,
      ed25519Pem: pem,
    });
    expect(result).toEqual({ ok: true, method: "ed25519" });
  });

  it("rejects a missing signature", () => {
    expect(
      verifyGhlWebhookSignature({
        rawBody: "{}",
        ghlSignature: null,
        legacySignature: null,
      })
    ).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a tampered body", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const signature = sign(null, Buffer.from('{"ok":true}'), privateKey).toString("base64");
    expect(
      verifyGhlWebhookSignature({
        rawBody: '{"ok":false}',
        ghlSignature: signature,
        legacySignature: null,
        ed25519Pem: pem,
      })
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("payload parse", () => {
  it("extracts location, contact, type, and webhook id", () => {
    const parsed = parseWebhookPayload(
      JSON.stringify({
        type: "ContactCreate",
        webhookId: "wh-1",
        locationId: "loc-1",
        contactId: "ct-1",
      })
    );
    expect(parsed.parsed).toBe(true);
    expect(parsed.eventType).toBe("ContactCreate");
    expect(parsed.providerEventId).toBe("wh-1");
    expect(parsed.locationId).toBe("loc-1");
    expect(parsed.contactKey).toBe("loc-1:ct-1");
  });

  it("still stores unparsed bodies without the raw string", () => {
    const parsed = parseWebhookPayload("not-json");
    expect(parsed.parsed).toBe(false);
    expect(parsed.eventType).toBe("unparsed");
    expect(parsed.providerEventId).toBe(hashRawBody("not-json"));
    expect(parsed.payload).toEqual({ _unparsed: true, bytes: "not-json".length });
    expect(JSON.stringify(parsed.payload)).not.toContain("not-json");
    expect(parsed.payload).not.toHaveProperty("raw");
  });

  it("redacts message bodies and keeps identity fields used to upsert leads", () => {
    const parsed = parseWebhookPayload(
      JSON.stringify({
        type: "InboundMessage",
        webhookId: "wh-body",
        locationId: "loc-1",
        contactId: "ct-1",
        email: "maya@example.com",
        phone: "+15555550101",
        body: "Secret reply about budget",
        message: "also a body",
        data: { html: "<p>hi</p>", firstName: "Maya" },
      })
    );
    expect(parsed.payload).toMatchObject({
      email: "maya@example.com",
      phone: "+15555550101",
      body: { redacted: true },
      message: { redacted: true },
    });
    const data = (parsed.payload as { data: Record<string, unknown> }).data;
    expect(data.html).toEqual({ redacted: true });
    expect(data.firstName).toBe("Maya");
    expect(JSON.stringify(parsed.payload)).not.toContain("Secret reply");
  });
});

describe("event kinds", () => {
  it("normalizes GHL aliases", () => {
    expect(normalizeEventKind("ContactCreate")).toBe("contact_created");
    expect(normalizeEventKind("InboundMessage")).toBe("inbound_message");
    expect(normalizeEventKind("AppointmentUpdate")).toBe("appointment_status");
    expect(normalizeEventKind("OpportunityUpdate")).toBe("opportunity_stage");
    expect(normalizeEventKind("SomethingElse")).toBe("ignored");
  });
});

describe("field maps", () => {
  it("maps custom fields onto answer keys without hardcoding GHL ids in code", () => {
    const answers = applyGhlFieldMaps(
      {
        customFields: [
          { id: "field-a", value: "30 days" },
          { id: "field-b", fieldValue: "15k" },
        ],
      },
      [
        { id: "1", ghlFieldId: "field-a", ghlFieldKey: null, answerKey: "timeline" },
        { id: "2", ghlFieldId: "field-b", ghlFieldKey: null, answerKey: "budget" },
      ]
    );
    expect(answers).toEqual({ timeline: "30 days", budget: "15k" });
    expect(answersEqual(mergeAnswers({ keep: "yes" }, answers), { keep: "yes", timeline: "30 days", budget: "15k" })).toBe(
      true
    );
  });
});

describe("message metadata", () => {
  it("records inbound engagement without the body", () => {
    const summary = inboundTouchSummary(mapMessageChannel("SMS"));
    expect(summary).toBe("Inbound sms received");
    expect(summary).not.toMatch(/secret|body|hello/i);
  });

  it("treats campaign outbound as a system touch", () => {
    expect(isAutomationOutbound({ messageType: "TYPE_CAMPAIGN_SMS", userId: "u1" })).toBe(true);
    expect(isAutomationOutbound({ userId: "u1", messageType: "SMS" })).toBe(false);
    expect(outboundTouchSummary("sms", "system")).toContain("automation");
  });

  it("maps no-show appointment status", () => {
    expect(mapAppointmentOutcome("noshow")).toBe("no_show");
    expect(mapAppointmentOutcome("cancelled")).toBe("cancelled");
    expect(mapAppointmentOutcome("confirmed")).toBeNull();
  });
});

describe("redaction", () => {
  it("strips tokens, bodies, and contact details", () => {
    const redacted = redactForLog({
      access_token: "tok_live",
      refresh_token: "ref_live",
      body: "Hey, call me at 555",
      outbound_body: "sent copy",
      generated_body: "draft copy",
      email: "maya@example.com",
      firstName: "Maya",
      eventType: "InboundMessage",
    }) as Record<string, unknown>;
    expect(redacted.access_token).toBe("[redacted]");
    expect(redacted.refresh_token).toBe("[redacted]");
    expect(redacted.body).toBe("[redacted]");
    expect(redacted.outbound_body).toBe("[redacted]");
    expect(redacted.generated_body).toBe("[redacted]");
    expect(redacted.email).toBe("[redacted]");
    expect(redacted.firstName).toBe("[redacted]");
    expect(redacted.eventType).toBe("InboundMessage");
    expect(JSON.stringify(redacted)).not.toContain("tok_live");
    expect(JSON.stringify(redacted)).not.toContain("maya@example.com");
  });
});

describe("retry and health", () => {
  it("marks dead after the bounded attempt count and not before", () => {
    expect(shouldMarkDead(WEBHOOK_MAX_ATTEMPTS - 1)).toBe(false);
    expect(shouldMarkDead(WEBHOOK_MAX_ATTEMPTS)).toBe(true);
    expect(Date.parse(nextAttemptAt(1))).toBeGreaterThan(Date.now());
  });

  it("flags stalled ingestion when unprocessed events age out", () => {
    const stale = isIngestionStale({
      connected: true,
      unprocessed: 3,
      oldestUnprocessedAgeMs: INGEST_STALE_PENDING_MS + 1,
      lastProcessedAgeMs: 1000,
      receivedLast24hCount: 3,
    });
    expect(stale.stale).toBe(true);
  });
});

describe("tokens and suppression", () => {
  it("refreshes before expiry", () => {
    expect(tokensNeedRefresh(new Date(Date.now() + 60_000), Date.now(), 10 * 60_000)).toBe(true);
    expect(tokensNeedRefresh(new Date(Date.now() + 60 * 60_000), Date.now(), 10 * 60_000)).toBe(false);
  });

  it("does not send to a DND or unsubscribed contact", () => {
    expect(contactIsSuppressed({ dnd: true }, "sms")).toBe("ghl_dnd");
    expect(contactIsSuppressed({ dndSettings: { SMS: { status: "active" } } }, "sms")).toBe("ghl_dnd_sms");
    expect(contactIsSuppressed({ unsubscribeEmail: true }, "email")).toBe("ghl_email_unsubscribed");
    expect(contactIsSuppressed({}, "sms")).toBeNull();
  });

  it("does not name the org that already claimed a location", () => {
    expect(LOCATION_CLAIMED_MESSAGE.toLowerCase()).not.toContain("org");
    expect(LOCATION_CLAIMED_MESSAGE).toContain("already linked");
  });
});
