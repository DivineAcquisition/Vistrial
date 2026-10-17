import { describe, expect, it } from "vitest";

import { GHL_OAUTH_SCOPES } from "@/lib/ghl/constants";
import { canManageConnections, canViewConnections } from "@/lib/connectors/access";
import { createAttemptState, readAttemptState } from "@/lib/connectors/attempts";
import { keepCalendarEvent } from "@/lib/connectors/calendar-match";
import { approvedScopeSet, assertApprovedScopes, CONNECTORS, missingRequiredScopes } from "@/lib/connectors/catalog";
import { hashSheet, parseCsv, planRows, suggestColumns } from "@/lib/connectors/files";
import { sideEffectsFor } from "@/lib/connectors/historic";
import { limitAllows, slotsUsed } from "@/lib/connectors/limits";
import { deliveryOutcome, parseInboundPayload, sameConnection, signBody, signaturesMatch, stripInboundText, WEBHOOK_MAX_BYTES } from "@/lib/connectors/payload";
import { applyOptMarker } from "@/lib/connectors/record";
import { mergeField } from "@/lib/connectors/record";
import { reconnectReminderHours } from "@/lib/connectors/reminders";
import { logLineHasSecret, safeLogFields } from "@/lib/connectors/secrets";
import { evaluateFreshness, holdBanner } from "@/lib/connectors/status";

describe("connector scopes", () => {
  it("fails when a connector requests a scope that is not approved", () => {
    for (const connector of CONNECTORS) {
      expect(() => assertApprovedScopes(connector.key, connector.permissions.map((row) => row.scope))).not.toThrow();
      expect(() => assertApprovedScopes(connector.key, ["not.a.real.scope"])).toThrow(/Unapproved/);
    }
    const ghl = GHL_OAUTH_SCOPES.split(" ");
    expect(() => assertApprovedScopes("gohighlevel", ghl)).not.toThrow();
    expect(approvedScopeSet("google_calendar").has("https://www.googleapis.com/auth/calendar.readonly")).toBe(true);
  });

  it("names the permissions that are missing", () => {
    expect(missingRequiredScopes("gohighlevel", ["contacts.readonly"])).toContain("opportunities.readonly");
  });
});

describe("connection limits", () => {
  const ghl = { connectorKey: "gohighlevel", status: "live", countsTowardLimit: true, limitGroup: null };
  const calendar = {
    connectorKey: "google_calendar",
    status: "live",
    countsTowardLimit: true,
    limitGroup: "calendar",
  };
  const webhook = {
    connectorKey: "generic_webhook",
    status: "live",
    countsTowardLimit: false,
    limitGroup: null,
  };

  it("counts each sub-account and counts every calendar as one", () => {
    expect(slotsUsed([ghl, { ...ghl }, calendar, { ...calendar }, { ...calendar }, webhook])).toBe(3);
  });

  it("stops at the plan limit on the server rule", () => {
    const rows = [ghl, { ...ghl }, calendar];
    expect(limitAllows({ rows, limit: 3, adding: { ...ghl } }).allowed).toBe(false);
    expect(limitAllows({ rows, limit: 3, adding: webhook }).allowed).toBe(true);
    expect(limitAllows({ rows, limit: 3, adding: { ...calendar } }).allowed).toBe(true);
    expect(limitAllows({ rows, limit: null, adding: { ...ghl } }).allowed).toBe(true);
  });
});

describe("roles", () => {
  it("hides Connections from operators and blocks staff from authorizing", () => {
    expect(canViewConnections({ role: "operator", isStaff: false })).toBe(false);
    expect(canViewConnections({ role: "setter", isStaff: false })).toBe(false);
    expect(canViewConnections({ role: "member", isStaff: false })).toBe(true);
    expect(canManageConnections({ role: "member", isStaff: false, canManageFlag: false })).toBe(false);
    expect(canManageConnections({ role: "member", isStaff: false, canManageFlag: true })).toBe(true);
    expect(canManageConnections({ role: "owner", isStaff: false, canManageFlag: false })).toBe(true);
    expect(canManageConnections({ role: "owner", isStaff: true, canManageFlag: true })).toBe(false);
  });
});

describe("inbound text and webhooks", () => {
  it("drops message text before anything is kept", () => {
    const raw = JSON.stringify({
      version: 1,
      id: "evt_1",
      type: "person.updated",
      person: { external_id: "p1", email: "a@b.co", first_name: "Ada" },
      body: "call me back about the quote",
      fields: { stage: "New", message: "secret words" },
      extra: "ignored-but-not-text",
    });
    const parsed = parseInboundPayload(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.stringify(parsed.event)).not.toMatch(/call me back|secret words/);
    expect(parsed.event.ignored).toEqual(expect.arrayContaining(["body", "extra", "message"]));
    expect(parsed.event.fields.stage).toBe("New");
  });

  it("rejects forged, replayed, oversized, and cross-workspace events", () => {
    const body = JSON.stringify({ version: 1, id: "evt_2", type: "person.created" });
    const secret = "signing-secret";
    expect(deliveryOutcome({
      signatureOk: signaturesMatch(signBody(secret, body), "deadbeef"),
      duplicate: false,
      parsed: parseInboundPayload(body),
    }).result).toBe("rejected");
    expect(deliveryOutcome({
      signatureOk: true,
      duplicate: true,
      parsed: parseInboundPayload(body),
    }).result).toBe("duplicate");
    expect(parseInboundPayload("x".repeat(WEBHOOK_MAX_BYTES + 1)).ok).toBe(false);
    expect(sameConnection("conn-a", "conn-b")).toBe(false);
    const stripped = stripInboundText({ transcript: "hello there" });
    expect(JSON.stringify(stripped.value)).not.toMatch(/hello there/);
  });
});

describe("historic safety", () => {
  it("announces nothing for history, replays, duplicates, and paused catch-up", () => {
    for (const flag of ["historic", "duplicate", "replay", "pausedCatchup", "occurredBeforeGoLive"] as const) {
      expect(sideEffectsFor({
        historic: flag === "historic",
        duplicate: flag === "duplicate",
        replay: flag === "replay",
        pausedCatchup: flag === "pausedCatchup",
        occurredBeforeGoLive: flag === "occurredBeforeGoLive",
      })).toEqual([]);
    }
    expect(sideEffectsFor({
      historic: false,
      duplicate: false,
      replay: false,
      pausedCatchup: false,
      occurredBeforeGoLive: false,
    })).toContain("clock");
  });
});

describe("record choice and opt-out", () => {
  it("does not overwrite the chosen record", () => {
    const merged = mergeField({
      record: { value: "12000", source: "GoHighLevel" },
      other: { value: "9000", source: "Airtable" },
    });
    expect(merged.value).toBe("12000");
    expect(merged.disagreement?.right.value).toBe("9000");
  });

  it("keeps an opt-out when another source says the opposite", () => {
    const opted = applyOptMarker({ optedOut: false, source: null }, { optedOut: true, source: "Airtable" });
    expect(applyOptMarker(opted, { optedOut: false, source: "GoHighLevel" }).optedOut).toBe(true);
  });
});

describe("attempts, freshness, and reminders", () => {
  const secret = "attempt-secret";

  it("rejects an expired or mismatched connection attempt", () => {
    const state = createAttemptState({
      orgId: "org",
      memberId: "member",
      connectorKey: "gohighlevel",
      secret,
      now: 1_000,
    });
    expect(readAttemptState({
      state,
      secret,
      orgId: "org",
      memberId: "member",
      connectorKey: "gohighlevel",
      now: 1_000 + 11 * 60 * 1000,
    }).ok).toBe(false);
    expect(readAttemptState({
      state,
      secret,
      orgId: "org",
      memberId: "other",
      connectorKey: "gohighlevel",
      now: 1_000,
    }).ok).toBe(false);
  });

  it("marks HighLevel delayed at 30 minutes and leaves a quiet webhook alone", () => {
    const now = 60 * 60 * 1000;
    expect(evaluateFreshness({
      state: "live",
      delayMs: 30 * 60 * 1000,
      quietIsOk: false,
      lastUpdateAt: now - 31 * 60 * 1000,
      lastFullCheckAt: now,
      now,
      failure: null,
    })).toBe("delayed");
    expect(evaluateFreshness({
      state: "live",
      delayMs: 45 * 60 * 1000,
      quietIsOk: true,
      lastUpdateAt: 0,
      lastFullCheckAt: now - 5 * 60 * 1000,
      now,
      failure: null,
    })).toBe("live");
    expect(evaluateFreshness({
      state: "live",
      delayMs: 30 * 60 * 1000,
      quietIsOk: false,
      lastUpdateAt: now,
      lastFullCheckAt: now,
      now,
      failure: "auth",
    })).toBe("needs_reconnecting");
  });

  it("sends only the first reconnect notice for a test-mode calendar", () => {
    expect(reconnectReminderHours(true)).toEqual([0]);
    expect(reconnectReminderHours(false)).toEqual([0, 24, 72]);
  });
});

describe("files and calendars", () => {
  it("does not create duplicates when the same file is uploaded again", () => {
    const sheet = parseCsv("first_name,email\nAda,ada@b.co\n");
    const matches = suggestColumns(sheet.headers);
    const first = planRows({ sheet, matches, existingKeys: new Set(), mode: "past", activeAllowed: false });
    expect(first.rows[0]?.action).toBe("create");
    const second = planRows({
      sheet,
      matches,
      existingKeys: new Set(["ada@b.co"]),
      mode: "past",
      activeAllowed: false,
    });
    expect(second.rows[0]?.action).toBe("skip");
    expect(hashSheet(sheet)).toBe(hashSheet(parseCsv("first_name,email\nAda,ada@b.co\n")));
  });

  it("refuses active leads while that mode is off", () => {
    const sheet = parseCsv("first_name,email\nAda,ada@b.co\n");
    const plan = planRows({
      sheet,
      matches: suggestColumns(sheet.headers),
      existingKeys: new Set(),
      mode: "active",
      activeAllowed: false,
    });
    expect(plan.rows[0]?.action).toBe("reject");
  });

  it("keeps a matched calendar event without the description or other attendees", () => {
    const kept = keepCalendarEvent(
      {
        id: "evt",
        status: "confirmed",
        start: "2026-10-17T15:00:00.000Z",
        end: "2026-10-17T15:30:00.000Z",
        title: "Consultation",
        description: "private notes about the lead",
        hangoutLink: "https://meet.google.com/abc",
        location: null,
        attendees: [
          { email: "lead@b.co", name: "Lead Person" },
          { email: "other@b.co", name: "Someone Else" },
        ],
      },
      new Set(["lead@b.co"])
    );
    expect(kept?.leadEmail).toBe("lead@b.co");
    expect(kept?.meetingKind).toBe("video");
    expect(JSON.stringify(kept)).not.toMatch(/private notes|Someone Else|other@b.co/);
    expect(keepCalendarEvent(
      {
        id: "busy",
        status: "confirmed",
        start: "2026-10-17T15:00:00.000Z",
        end: "2026-10-17T16:00:00.000Z",
        title: "Dentist",
        description: null,
        hangoutLink: null,
        location: null,
        attendees: [{ email: "friend@b.co" }],
      },
      new Set(["lead@b.co"])
    )).toBeNull();
  });
});

describe("logs", () => {
  it("fails when a secret would be written to a log line", () => {
    const safe = safeLogFields({ orgId: "org", access_token: "secret-value", note: "bearer abcdefghijklmnop" });
    const line = JSON.stringify(safe);
    expect(logLineHasSecret(line)).toBe(false);
    expect(logLineHasSecret("access_token=abc")).toBe(true);
  });
});

describe("hold banner", () => {
  it("names the tool without a lead", () => {
    expect(holdBanner(["GoHighLevel"])).toBe("Some data from GoHighLevel may be out of date.");
  });
});
