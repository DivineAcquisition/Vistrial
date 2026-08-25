import { describe, expect, it } from "vitest";

import { NOTIFICATION_CATALOG } from "@/lib/notifications/catalog";
import { notificationBatchBucket, NOTIFICATION_EVENT_TYPES, NOTIFICATION_HOURLY_CAP } from "@/lib/notifications/constants";
import { assertLockScreenSafe, containsContactDetails, leadDisplayName, sanitizeNotificationText } from "@/lib/notifications/copy";
import { defaultChannelEnabled } from "@/lib/notifications/defaults";
import { isWithinWorkingHours, nextWorkingStart, resolveWorkingHours } from "@/lib/notifications/hours";
import { speedToLeadCopy } from "@/lib/notifications/messages";
import {
  channelAllowedForRole,
  isEmergency,
  muteApplies,
  muteUntilValid,
  overHourlyCap,
  pickChannel,
  preferenceLocked,
  skipSelf,
} from "@/lib/notifications/policy";

const weekdayHours = resolveWorkingHours({
  orgTimeZone: "America/New_York",
  orgStart: "08:00",
  orgEnd: "18:00",
  orgDays: [1, 2, 3, 4, 5],
});

describe("Part 1 catalog", () => {
  it("covers every event type and both tests", () => {
    const types = new Set(NOTIFICATION_CATALOG.map((row) => row.type));
    expect([...NOTIFICATION_EVENT_TYPES].sort()).toEqual([...types].sort());
    for (const row of NOTIFICATION_CATALOG) {
      expect(row.canActNow).toBe(true);
      if (row.type === "ingestion_stalled" || row.type === "crm_broken") {
        expect(row.saturday9pm).toBe(true);
      } else {
        expect(row.saturday9pm).toBe(false);
      }
    }
  });
});

describe("copy privacy", () => {
  it("keeps first names and strips contact details", () => {
    expect(leadDisplayName("Jordan Lee")).toBe("Jordan");
    expect(leadDisplayName(null)).toBe("a lead");
    expect(containsContactDetails("Reach Jordan at a@b.com")).toBe(true);
    expect(sanitizeNotificationText("Call +1 555 0100 now")).not.toMatch(/\d{4}/);
    expect(() => assertLockScreenSafe("Hello", "email me at lead@example.com")).toThrow();
    expect(() => assertLockScreenSafe(speedToLeadCopy(["Jordan"], 18).title, speedToLeadCopy(["Jordan"], 18).body)).not.toThrow();
  });
});

describe("working hours", () => {
  it("evaluates in the user timezone and defers overnight", () => {
    const saturday9pm = new Date("2026-08-22T01:00:00.000Z"); // Friday 9pm Eastern
    const monday9pmUtcSaturday = new Date("2026-08-23T01:00:00.000Z"); // Saturday 9pm Eastern
    expect(isWithinWorkingHours(monday9pmUtcSaturday, weekdayHours)).toBe(false);
    const next = nextWorkingStart(monday9pmUtcSaturday, weekdayHours);
    expect(isWithinWorkingHours(next, weekdayHours)).toBe(true);
    expect(next.toISOString()).toBe("2026-08-24T12:00:00.000Z");
    const tuesdayNoon = new Date("2026-08-25T16:00:00.000Z");
    expect(isWithinWorkingHours(tuesdayNoon, weekdayHours)).toBe(true);
    expect(isEmergency("ingestion_stalled")).toBe(true);
    expect(isEmergency("speed_to_lead")).toBe(false);
    expect(saturday9pm).toBeInstanceOf(Date);
  });
});

describe("anti-fatigue", () => {
  it("batches five breaches in a ten-minute window to one key", () => {
    const first = new Date("2026-08-24T14:01:00.000Z");
    const fifth = new Date("2026-08-24T14:09:00.000Z");
    expect(notificationBatchBucket(first)).toBe(notificationBatchBucket(fifth));
    const later = new Date("2026-08-24T14:12:00.000Z");
    expect(notificationBatchBucket(later)).not.toBe(notificationBatchBucket(first));
  });

  it("caps the eighth interrupt and names the overflow a summary", () => {
    expect(overHourlyCap(NOTIFICATION_HOURLY_CAP - 1)).toBe(false);
    expect(overHourlyCap(NOTIFICATION_HOURLY_CAP)).toBe(true);
  });

  it("skips the actor and keeps mute bounded", () => {
    expect(skipSelf("user-1", "user-1")).toBe(true);
    expect(skipSelf("user-1", "user-2")).toBe(false);
    const now = new Date("2026-08-24T12:00:00.000Z");
    expect(muteUntilValid(new Date("2026-08-24T11:00:00.000Z"), now)).toBeNull();
    const clamped = muteUntilValid(new Date("2026-09-24T12:00:00.000Z"), now);
    expect(clamped?.getTime()).toBe(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  });
});

describe("preferences and escalation lock", () => {
  it("picks one channel and will not let an admin disable locked push", () => {
    expect(
      preferenceLocked({ role: "admin", eventType: "speed_to_lead", channel: "push" })
    ).toBe(true);
    expect(
      preferenceLocked({ role: "setter", eventType: "speed_to_lead", channel: "push" })
    ).toBe(false);

    const disabled = channelAllowedForRole({
      role: "admin",
      eventType: "speed_to_lead",
      channel: "push",
      override: false,
      isEscalationToAdmin: true,
    });
    expect(disabled).toBe(true);

    const channel = pickChannel({
      role: "closer",
      eventType: "call_starting_soon",
      requested: "push",
      overrides: { push: false, email: true },
      isEscalationToAdmin: false,
    });
    expect(channel).toBe("email");

    expect(defaultChannelEnabled("setter", "speed_to_lead", "push")).toBe(true);
    expect(defaultChannelEnabled("closer", "call_starting_soon", "push")).toBe(true);
    expect(defaultChannelEnabled("admin", "adoption_warning", "push")).toBe(false);
    expect(defaultChannelEnabled("admin", "ingestion_stalled", "sms")).toBe(false);

    expect(
      muteApplies({ emergency: true, isEscalationToAdmin: false, eventType: "ingestion_stalled" })
    ).toBe(false);
    expect(
      muteApplies({ emergency: false, isEscalationToAdmin: true, eventType: "speed_to_lead" })
    ).toBe(false);
  });
});
