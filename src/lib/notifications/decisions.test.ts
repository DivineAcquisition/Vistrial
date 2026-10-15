import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { renderFooter } from "@/lib/email/footer";
import { DNS_SNAPSHOT, EMAIL_REPLY_TO, lifecycleSendingOpen, streamSendAllowed, updatesDnsReady } from "@/lib/email/streams";
import { NOTIFICATION_BATCH_WINDOW_MS, NOTIFICATION_HOURLY_CAP, NOTIFICATION_WORKSPACE_HOURLY_CAP } from "@/lib/notifications/constants";
import { exemptFromLimits, groupHoldUntil, interruptCapped, isCriticalEvent, shouldGroup } from "@/lib/notifications/decisions";
import { isInsideQuiet, minutesAfterLocalHour, nextQuietEnd } from "@/lib/notifications/hours";
import {
  criticalText,
  inboundTextCommand,
  overTextDailyCap,
  STAFF_AFTER_HOURS_PAGING,
  textChannelEnabled,
  textHasLeadContent,
  textOptInAllows,
  TEXT_COST_USD,
  TEXT_DAILY_CAP,
  verifyTelnyxSignature,
  withStopHelp,
} from "@/lib/notifications/text";

const filled = {
  recipientEmail: "owner@example.com",
  workspaceName: "Northwind Legal",
  role: "Owner",
  inviterName: "Ada",
  referenceId: "req-1",
  siteName: "vistrial.io",
  date: "October 22, 2026",
  preferencesUrl: "https://app.vistrial.io/app/settings/notifications",
  unsubscribeUrl: "https://app.vistrial.io/email/unsubscribe?token=abc",
};

describe("approved notification decisions", () => {
  it("groups non-critical alerts for 15 minutes and never holds a critical one", () => {
    expect(NOTIFICATION_BATCH_WINDOW_MS).toBe(15 * 60 * 1000);
    const now = new Date("2026-08-24T14:00:00.000Z");
    const hold = groupHoldUntil(now, "speed_to_lead", true);
    expect(hold?.getTime()).toBe(now.getTime() + NOTIFICATION_BATCH_WINDOW_MS);
    expect(groupHoldUntil(now, "ingestion_stalled", true)).toBeNull();
    expect(groupHoldUntil(now, "billing_issue", true)).toBeNull();
    expect(shouldGroup("crm_broken")).toBe(false);
    expect(isCriticalEvent("ingestion_stalled")).toBe(true);
  });

  it("caps a person at 8 and a workspace at 200, and summarizes a critical overflow", () => {
    expect(
      interruptCapped({
        personCount: NOTIFICATION_HOURLY_CAP,
        workspaceCount: 0,
        eventType: "speed_to_lead",
        isTest: false,
      })
    ).toBe("summarize");
    expect(
      interruptCapped({
        personCount: 0,
        workspaceCount: NOTIFICATION_WORKSPACE_HOURLY_CAP,
        eventType: "ingestion_stalled",
        isTest: false,
      })
    ).toBe("summarize");
    expect(
      interruptCapped({
        personCount: 100,
        workspaceCount: 500,
        eventType: "billing_issue",
        isTest: false,
      })
    ).toBe("send");
    expect(exemptFromLimits("billing_issue")).toBe(true);
    expect(exemptFromLimits("speed_to_lead")).toBe(false);
  });

  it("keeps text off, generic, and capped at 5 a day", () => {
    expect(textChannelEnabled({})).toBe(false);
    expect(textChannelEnabled({ TELNYX_NOTIFICATIONS_ENABLED: "true" })).toBe(false);
    expect(
      textChannelEnabled({
        TELNYX_NOTIFICATIONS_ENABLED: "true",
        TELNYX_REGISTRATION_CONFIRMED: "true",
      })
    ).toBe(true);
    const body = withStopHelp(criticalText("ingestion_stalled") ?? "");
    expect(body).toMatch(/STOP/);
    expect(body).toMatch(/HELP/);
    expect(textHasLeadContent(body)).toBe(false);
    expect(criticalText("speed_to_lead")).toBeNull();
    expect(overTextDailyCap(TEXT_DAILY_CAP - 1)).toBe(false);
    expect(overTextDailyCap(TEXT_DAILY_CAP)).toBe(true);
    expect(TEXT_COST_USD.estimatedMin).toBe(0.007);
    expect(TEXT_COST_USD.estimatedMax).toBe(0.009);
    expect(STAFF_AFTER_HOURS_PAGING).toBe(false);
    expect(textOptInAllows({ optedInAt: null, optedOutAt: null })).toBe(false);
    expect(textOptInAllows({ optedInAt: "2026-10-15T00:00:00.000Z", optedOutAt: null })).toBe(true);
    expect(
      textOptInAllows({
        optedInAt: "2026-10-15T00:00:00.000Z",
        optedOutAt: "2026-10-15T01:00:00.000Z",
      })
    ).toBe(false);
    expect(inboundTextCommand("STOP")).toBe("stop");
    expect(inboundTextCommand("Help")).toBe("help");
    expect(inboundTextCommand("hello")).toBeNull();
  });

  it("verifies a Telnyx signature and rejects a stale one", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
    const timestamp = "1700000000";
    const body = "{\"data\":{}}";
    const signature = sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString("base64");
    expect(
      verifyTelnyxSignature({
        rawBody: body,
        signature,
        timestamp,
        publicKeyBase64: raw,
        nowSeconds: 1700000000,
      })
    ).toBe(true);
    expect(
      verifyTelnyxSignature({
        rawBody: body,
        signature,
        timestamp,
        publicKeyBase64: raw,
        nowSeconds: 1700000400,
      })
    ).toBe(false);
  });

  it("does not send setup mail until updates.vistrial.io DNS is confirmed", () => {
    expect(updatesDnsReady(DNS_SNAPSHOT)).toBe(false);
    expect(lifecycleSendingOpen({ EMAIL_UPDATES_DNS_CONFIRMED: "true" })).toBe(false);
    expect(EMAIL_REPLY_TO).toBe("contact@vistrial.io");
    const lifecycle = streamSendAllowed({
      category: "E",
      transactionalFrom: "Vistrial <notifications@mail.vistrial.io>",
      lifecycleFrom: "Vistrial <news@updates.vistrial.io>",
      env: { EMAIL_UPDATES_DNS_CONFIRMED: "true" },
    });
    expect(lifecycle.ok).toBe(false);
    const account = streamSendAllowed({
      category: "A",
      transactionalFrom: "Vistrial <notifications@mail.vistrial.io>",
      lifecycleFrom: null,
    });
    expect(account.ok).toBe(true);
    const wrongHost = streamSendAllowed({
      category: "B",
      transactionalFrom: "Vistrial <news@updates.vistrial.io>",
      lifecycleFrom: null,
    });
    expect(wrongHost.ok).toBe(false);
  });

  it("keeps category F built and unsent", () => {
    const result = renderFooter({ category: "F", vars: filled });
    expect(result.ok).toBe(false);
  });

  it("leaves quiet hours off by default and sends the digest at 8:00 local", () => {
    const eight = new Date("2026-08-24T12:00:00.000Z");
    expect(isInsideQuiet(eight, null, "America/New_York")).toBe(false);
    expect(minutesAfterLocalHour(eight, "America/New_York", 8)).toBe(0);
    const quiet = { startHm: "22:00", endHm: "07:00" };
    const late = new Date("2026-08-23T02:00:00.000Z");
    expect(isInsideQuiet(late, quiet, "America/New_York")).toBe(true);
    expect(nextQuietEnd(late, quiet, "America/New_York").toISOString()).toBe("2026-08-23T11:00:00.000Z");
  });
});
