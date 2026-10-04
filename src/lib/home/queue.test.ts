import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTION_GROUP_LABELS,
  ACTION_TYPES,
  APPROVAL_MODE_LABELS,
  APPROVER_LABELS,
  canApproveItem,
  canEditApprovalGate,
  effectiveGate,
  needsAutoRunConfirmation,
  QUEUE_KINDS,
  whoCanApprove,
} from "@/lib/home/catalog";
import {
  groupActivity,
  itemPreview,
  itemTitle,
  messageChannel,
  noShowDraft,
  nudgeText,
  parseDrafts,
  quietLeadDraft,
  runModeLabel,
  sortQueue,
  type ActivityEvent,
} from "@/lib/home/queue";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261002010000_home_screen.sql"),
  "utf8"
);

describe("approval gate catalog", () => {
  it("matches the action types the database registry seeds, with the same defaults", () => {
    const seeded = [...migration.matchAll(/\('([a-z_]+)', '([a-z_]+)', (true|false), '([a-z_]+)'\)/g)].map(
      ([, id, area, reaches, mode]) => ({ id, area, reachesPeople: reaches === "true", defaultMode: mode })
    );
    expect(seeded).toEqual(
      ACTION_TYPES.map((type) => ({
        id: type.id,
        area: type.area,
        reachesPeople: type.reachesPeople,
        defaultMode: type.defaultMode,
      }))
    );
  });

  it("ships the defaults the prompt pack specifies", () => {
    const defaults = Object.fromEntries(ACTION_TYPES.map((type) => [type.label, APPROVAL_MODE_LABELS[type.defaultMode]]));
    expect(defaults).toEqual({
      "Follow-up messages to quiet leads": "Ask first",
      "No-show rebooking messages": "Ask first",
      "First reply to a new lead": "Ask first",
      "Reports sent to the client": "Ask first",
      "CRM stage or tag changes": "Ask first",
      "Internal tasks and nudges to setters": "Auto-run",
      "Escalations to the owner": "Auto-run",
    });
  });

  it("keeps every message to people under the people heading, asking first", () => {
    for (const type of ACTION_TYPES) {
      expect(type.group === "people").toBe(type.reachesPeople);
      if (type.reachesPeople) expect(type.defaultMode).toBe("ask_first");
    }
    expect(ACTION_GROUP_LABELS.people).toBe("Messages to leads and clients");
    expect(ACTION_GROUP_LABELS.internal).toBe("Internal actions");
  });

  it("asks first for an action type it has never heard of", () => {
    expect(effectiveGate([], "retention_win_back")).toEqual({
      mode: "ask_first",
      approver: "owners_and_managers",
      reachesPeople: true,
    });
  });

  it("uses the stored choice when there is one", () => {
    expect(effectiveGate([{ actionType: "setter_nudge", mode: "off", approver: "assigned" }], "setter_nudge")).toEqual({
      mode: "off",
      approver: "assigned",
      reachesPeople: false,
    });
    expect(effectiveGate([{ actionType: "setter_nudge", mode: "bogus", approver: "x" }], "setter_nudge").mode).toBe(
      "auto_run"
    );
  });

  it("maps every queue kind to a known action type", () => {
    for (const kind of QUEUE_KINDS) {
      expect(ACTION_TYPES.some((type) => type.id === kind.actionType)).toBe(true);
    }
  });

  it("confirms only when a people-reaching action newly becomes auto-run", () => {
    expect(needsAutoRunConfirmation(true, "ask_first", "auto_run")).toBe(true);
    expect(needsAutoRunConfirmation(true, "auto_run", "auto_run")).toBe(false);
    expect(needsAutoRunConfirmation(false, "ask_first", "auto_run")).toBe(false);
  });

  it("lets only owners open the settings", () => {
    expect(canEditApprovalGate("owner", false)).toBe(true);
    expect(canEditApprovalGate("admin", false)).toBe(false);
    expect(canEditApprovalGate("setter", false)).toBe(false);
    expect(canEditApprovalGate("setter", true)).toBe(true);
  });

  it("keeps labels in sentence case", () => {
    const labels = [
      ...ACTION_TYPES.map((type) => type.label),
      ...Object.values(APPROVAL_MODE_LABELS),
      ...Object.values(APPROVER_LABELS),
      ...Object.values(ACTION_GROUP_LABELS),
    ];
    for (const label of labels) {
      const words = label.split(" ").slice(1);
      for (const word of words) {
        if (word === "CRM") continue;
        expect(word, label).toBe(word.toLowerCase());
      }
    }
  });
});

describe("who may approve", () => {
  const base = { isPlatformAdmin: false, memberId: "m1", assignedMemberId: "m1", escalated: false };

  it("follows the approver setting", () => {
    expect(canApproveItem({ ...base, approver: "owner_only", role: "admin" })).toBe(false);
    expect(canApproveItem({ ...base, approver: "owner_only", role: "owner" })).toBe(true);
    expect(canApproveItem({ ...base, approver: "owners_and_managers", role: "admin" })).toBe(true);
    expect(canApproveItem({ ...base, approver: "owners_and_managers", role: "setter" })).toBe(false);
    expect(canApproveItem({ ...base, approver: "assigned", role: "setter" })).toBe(true);
    expect(canApproveItem({ ...base, approver: "assigned", role: "setter", memberId: "m2" })).toBe(false);
    expect(canApproveItem({ ...base, approver: "assigned", role: "setter", assignedMemberId: null })).toBe(false);
  });

  it("hands an escalated item to the owner alone", () => {
    expect(canApproveItem({ ...base, approver: "owners_and_managers", role: "admin", escalated: true })).toBe(false);
    expect(canApproveItem({ ...base, approver: "assigned", role: "owner", escalated: true })).toBe(true);
    expect(whoCanApprove("assigned", true)).toMatch(/only an owner/);
    expect(whoCanApprove("owners_and_managers", false)).toBe("Only owners and managers can approve this.");
  });
});

describe("drafts", () => {
  it("writes a short, plain message with the lead's name", () => {
    const quiet = quietLeadDraft({
      firstName: "Dana",
      offerName: "the coaching program",
      channel: "email",
      voice: { greeting: null, signoff: "Sam" },
    });
    expect(quiet.subject).toBe("Checking in");
    expect(quiet.body).toMatch(/^Hi Dana, just checking in about the coaching program\./);
    expect(quiet.body.endsWith("\n\nSam")).toBe(true);
    const noShow = noShowDraft({ firstName: null, channel: "sms", voice: { greeting: "Hey {name},", signoff: null } });
    expect(noShow.subject).toBeNull();
    expect(noShow.body).toMatch(/^Hey there, sorry we missed/);
  });

  it("texts when there is a phone, emails when there is not, and skips when neither", () => {
    expect(messageChannel({ phone: "+15555550100", email: "a@b.co" })).toBe("sms");
    expect(messageChannel({ phone: " ", email: "a@b.co" })).toBe("email");
    expect(messageChannel({ phone: null, email: null })).toBeNull();
  });

  it("titles items the way the owner reads them", () => {
    expect(itemTitle("quiet_lead_follow_up", 5)).toBe("Follow up with 5 leads quiet for 48h+");
    expect(itemTitle("no_show_rebook", 1)).toBe("Rebook 1 no-show");
    expect(itemTitle("untouched_lead_nudge", 2, { assigneeName: "Sam", windowMinutes: 15 })).toBe(
      "Nudge Sam about 2 new leads waiting past your 15 min window"
    );
    expect(nudgeText({ leadName: "Dana", waitedMinutes: 125, windowMinutes: 15 })).toBe(
      "Reach out to Dana. They have waited 2 hr with no reply, past your 15 min response window."
    );
  });

  it("previews the first message and drops malformed drafts", () => {
    const drafts = parseDrafts([
      { leadId: "a", leadName: "Dana", channel: "sms", body: "Hi Dana, checking in." },
      { leadId: "b", channel: "fax", body: "nope" },
      "junk",
      { leadId: "c", leadName: "Lee", channel: "task", body: "Call Lee", result: { status: "sent", at: "2026-10-01T00:00:00Z" } },
    ]);
    expect(drafts.map((draft) => draft.leadId)).toEqual(["a", "c"]);
    expect(drafts[1].result?.status).toBe("sent");
    expect(itemPreview(drafts)).toBe("To Dana: “Hi Dana, checking in.”");
  });
});

describe("queue order", () => {
  it("puts untouched new leads first, then no-shows, then quiet leads, oldest first within each", () => {
    const sorted = sortQueue([
      { id: "q", kind: "quiet_lead_follow_up", createdAt: "2026-10-01T00:00:00Z", escalatedAt: null },
      { id: "n2", kind: "no_show_rebook", createdAt: "2026-10-02T00:00:00Z", escalatedAt: null },
      { id: "n1", kind: "no_show_rebook", createdAt: "2026-10-01T05:00:00Z", escalatedAt: null },
      { id: "u", kind: "untouched_lead_nudge", createdAt: "2026-10-02T09:00:00Z", escalatedAt: null },
      { id: "q2", kind: "quiet_lead_follow_up", createdAt: "2026-10-02T00:00:00Z", escalatedAt: "2026-10-02T04:00:00Z" },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["u", "n1", "n2", "q2", "q"]);
  });
});

describe("activity log", () => {
  const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
    id: Math.random().toString(36),
    actionType: "quiet_lead_follow_up",
    occurredAt: "2026-10-02T12:00:00Z",
    runMode: "auto_run",
    approvedByMemberId: null,
    approvedByName: null,
    count: 1,
    leadIds: ["a"],
    ...overrides,
  });

  it("groups similar actions close together and keeps different ones apart", () => {
    const entries = groupActivity([
      event({ occurredAt: "2026-10-02T12:00:00Z", leadIds: ["a"] }),
      event({ occurredAt: "2026-10-02T11:45:00Z", leadIds: ["b"], count: 2 }),
      event({ occurredAt: "2026-10-02T11:20:00Z", leadIds: ["c"] }),
      // Two hours later in the past: a separate line.
      event({ occurredAt: "2026-10-02T09:00:00Z", leadIds: ["d"] }),
      // Approved by a person: never merged with auto-run.
      event({ occurredAt: "2026-10-02T11:50:00Z", runMode: "approved", approvedByName: "Olive" }),
    ]);
    expect(entries.map((entry) => [entry.description, entry.count, runModeLabel(entry)])).toEqual([
      ["Followed up with 4 quiet leads", 4, "Auto-run"],
      ["Followed up with 1 quiet lead", 1, "Approved by Olive"],
      ["Followed up with 1 quiet lead", 1, "Auto-run"],
    ]);
  });

  it("counts distinct leads and dates the line by its newest event", () => {
    const entries = groupActivity([
      event({ occurredAt: "2026-10-02T12:00:00Z", leadIds: ["a"] }),
      event({ occurredAt: "2026-10-02T11:45:00Z", leadIds: ["b"] }),
      event({ occurredAt: "2026-10-02T11:20:00Z", leadIds: ["c"] }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].leadIds).toEqual(["a", "b", "c"]);
    expect(entries[0].at).toBe("2026-10-02T12:00:00Z");
  });
});

describe("settings history", () => {
  it("reads each change as a sentence", async () => {
    const { describeGateChange } = await import("@/lib/home/catalog");
    expect(
      describeGateChange({ actionType: "no_show_rebook", field: "mode", fromValue: "ask_first", toValue: "auto_run" })
    ).toBe("No-show rebooking messages: Ask first → Auto-run");
    expect(
      describeGateChange({ actionType: "setter_nudge", field: "approver", fromValue: "owners_and_managers", toValue: "assigned" })
    ).toBe("Internal tasks and nudges to setters, who can approve: Owners and managers → Anyone assigned to that lead");
    expect(
      describeGateChange({ actionType: null, field: "queue_wait_limit_minutes", fromValue: "240", toValue: "120" })
    ).toBe("Escalate after waiting: 4 hours → 2 hours");
    expect(describeGateChange({ actionType: null, field: "reviewed", fromValue: null, toValue: "skipped" })).toBe(
      "Skipped the setup step and kept the defaults"
    );
  });
});
