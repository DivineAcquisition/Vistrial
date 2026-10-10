import { describe, expect, it } from "vitest";

import { groupNotifications, noticePath, type NoticeRow } from "@/lib/portal/notification-list";

function row(patch: Partial<NoticeRow>): NoticeRow {
  return {
    id: "1",
    title: "A lead waited",
    body: "Open the case file.",
    href: "https://app.vistrial.io/app/cases/abc",
    event_type: "speed_to_lead",
    channel: "email",
    status: "sent",
    queued_at: "2026-10-10T12:00:30.000Z",
    acted_at: null,
    dedupe_key: "speed:email",
    ...patch,
  };
}

describe("notification list", () => {
  it("merges the same alert sent on two channels", () => {
    const groups = groupNotifications([
      row({ id: "a", channel: "email", dedupe_key: "speed:email" }),
      row({ id: "b", channel: "push", dedupe_key: "speed:push", queued_at: "2026-10-10T12:00:40.000Z" }),
      row({ id: "c", title: "Morning brief", event_type: "daily_brief", queued_at: "2026-10-10T08:00:00.000Z", acted_at: "2026-10-10T08:05:00.000Z" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.ids.sort()).toEqual(["a", "b"]);
    expect(groups[0]?.channels).toEqual(["Email", "Push"]);
    expect(groups[0]?.unread).toBe(true);
    expect(groups[0]?.href).toBe("/app/cases/abc");
    expect(groups[1]?.unread).toBe(false);
  });

  it("keeps in-app paths and drops anything outside the app", () => {
    expect(noticePath("/app/help/1?sent=1")).toBe("/app/help/1?sent=1");
    expect(noticePath("https://example.com/phish")).toBe("/app/notifications");
  });
});
