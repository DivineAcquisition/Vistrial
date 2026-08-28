import { describe, expect, it } from "vitest";

import { previousEqualRange } from "@/lib/portal/range";

describe("previousEqualRange", () => {
  it("returns an equal-length window that does not start before activation", () => {
    const previous = previousEqualRange(
      {
        key: "custom",
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-15T00:00:00.000Z",
        fromDate: "2026-08-01",
        toDate: "2026-08-15",
      },
      "2026-07-20T00:00:00.000Z"
    );
    expect(previous?.from).toBe("2026-07-20T00:00:00.000Z");
    expect(previous?.to).toBe("2026-08-01T00:00:00.000Z");
  });

  it("returns null when there is no room after activation", () => {
    expect(
      previousEqualRange(
        {
          key: "custom",
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-08-15T00:00:00.000Z",
          fromDate: "2026-08-01",
          toDate: "2026-08-15",
        },
        "2026-08-01T00:00:00.000Z"
      )
    ).toBeNull();
  });
});
