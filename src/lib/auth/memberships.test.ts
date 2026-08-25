import { describe, expect, it } from "vitest";

import { membershipsFromRows, type MemberRow } from "@/lib/auth/memberships";
import type { OrgSummary } from "@/lib/auth/types";

const row: MemberRow = {
  id: "member-1",
  org_id: "org-1",
  role: "owner",
  display_name: "Malik",
  email: "malik@divineacquisition.io",
  organizations: null,
};

const org: OrgSummary = {
  id: "org-1",
  name: "Divine Acquisition",
  slug: "divine-acquisition",
  timezone: "America/New_York",
  ghlLocationId: null,
};

describe("membershipsFromRows", () => {
  it("keeps a membership when the org is embedded", () => {
    const memberships = membershipsFromRows([
      {
        ...row,
        organizations: {
          id: "org-1",
          name: "Divine Acquisition",
          slug: "divine-acquisition",
          timezone: "America/New_York",
          ghl_location_id: null,
        },
      },
    ]);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.org.slug).toBe("divine-acquisition");
  });

  it("does not treat a missing embed as no workspace when the org is loaded separately", () => {
    const memberships = membershipsFromRows([row], new Map([["org-1", org]]));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.orgId).toBe("org-1");
    expect(memberships[0]?.role).toBe("owner");
  });

  it("drops the row only when no org can be resolved", () => {
    expect(membershipsFromRows([row])).toEqual([]);
  });
});
