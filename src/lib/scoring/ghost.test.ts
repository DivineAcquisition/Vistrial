import { describe, expect, it } from "vitest";

import { decideGhostAction } from "@/lib/scoring/ghost";
import { canOverrideLead } from "@/lib/auth/permissions";

describe("decideGhostAction", () => {
  const base = {
    status: "working" as const,
    daysSilent: 21,
    softDays: 14,
    hardDays: 30,
    approachingAt: null,
  };

  it("flags at the soft threshold and ghosts at the hard threshold", () => {
    expect(decideGhostAction(base)).toBe("flag");
    expect(decideGhostAction({ ...base, daysSilent: 14 })).toBe("flag");
    expect(decideGhostAction({ ...base, daysSilent: 30 })).toBe("ghost");
    expect(decideGhostAction({ ...base, daysSilent: 13 })).toBe("noop");
  });

  it("does not flag twice while already approaching", () => {
    expect(decideGhostAction({ ...base, approachingAt: "2026-01-01T00:00:00Z" })).toBe("noop");
  });

  it("does not re-ghost an already ghosted lead", () => {
    expect(decideGhostAction({ ...base, daysSilent: 40, status: "ghost" })).toBe("noop");
  });

  it("clears the approaching flag once activity is inside the soft window", () => {
    expect(
      decideGhostAction({
        ...base,
        daysSilent: 2,
        approachingAt: "2026-01-01T00:00:00Z",
      })
    ).toBe("clear");
  });

  it("skips closed leads", () => {
    expect(decideGhostAction({ ...base, status: "closed_won" })).toBe("noop");
    expect(decideGhostAction({ ...base, status: "closed_lost" })).toBe("noop");
  });
});

describe("canOverrideLead", () => {
  it("lets owners and admins override anyone, and setters only their assignment", () => {
    expect(
      canOverrideLead({
        role: "owner",
        memberId: "s",
        assignedSetterId: null,
        assignedCloserId: null,
      })
    ).toBe(true);
    expect(
      canOverrideLead({
        role: "setter",
        memberId: "s",
        assignedSetterId: "s",
        assignedCloserId: null,
      })
    ).toBe(true);
    expect(
      canOverrideLead({
        role: "setter",
        memberId: "s",
        assignedSetterId: "other",
        assignedCloserId: null,
      })
    ).toBe(false);
    expect(
      canOverrideLead({
        role: "closer",
        memberId: "c",
        assignedSetterId: null,
        assignedCloserId: "c",
      })
    ).toBe(true);
  });
});
