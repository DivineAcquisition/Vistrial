import { describe, expect, it } from "vitest";

import {
  callingHoursWarning,
  completionLogsTouch,
  dueChoice,
  initialStatus,
  matchOpenTask,
  nextSuitableCall,
  purposeKey,
  sourceSentence,
  taskReminderCopy,
} from "@/lib/tasks/model";

describe("tasks", () => {
  it("allows several open tasks on one lead and updates the same purpose", () => {
    const existing = [
      { id: "1", leadId: "lead", source: "sentry" as const, purpose: "clock", title: "Call", status: "suggested" as const },
      { id: "2", leadId: "lead", source: "person" as const, purpose: "quote", title: "Send quote", status: "open" as const },
    ];
    expect(matchOpenTask(existing, { leadId: "lead", source: "person", purpose: "book" })).toBeNull();
    expect(matchOpenTask(existing, { leadId: "lead", source: "sentry", purpose: "clock" })?.id).toBe("1");
    expect(purposeKey("sentry", "Clock")).toBe(purposeKey("sentry", "clock"));
  });

  it("suggests agent tasks unless the workspace adds them directly", () => {
    expect(initialStatus("sentry", "suggested")).toBe("suggested");
    expect(initialStatus("playbook", "direct")).toBe("open");
    expect(initialStatus("person", "suggested")).toBe("open");
  });

  it("does not treat completion as a logged touch", () => {
    expect(completionLogsTouch()).toBe(false);
  });

  it("warns when a call is outside the lead's local calling hours", () => {
    const late = new Date("2026-10-15T02:30:00.000Z");
    expect(callingHoursWarning(late, "America/New_York")).toMatch(/calling hours/);
    const moved = nextSuitableCall(late, "America/New_York");
    expect(callingHoursWarning(moved, "America/New_York")).toBeNull();
    expect(dueChoice("in_3_days", new Date("2026-10-15T15:00:00.000Z")).getDate()).toBe(18);
  });

  it("names the source in plain words and keeps reminder copy generic", () => {
    expect(sourceSentence("sentry", "Jordan has not heard back in 2 days")).toBe(
      "Suggested by Sentry because Jordan has not heard back in 2 days"
    );
    expect(taskReminderCopy("due").body).not.toMatch(/Jordan|@|\d{3}/);
    expect(taskReminderCopy("overdue").title).toBe("Task overdue");
  });
});
