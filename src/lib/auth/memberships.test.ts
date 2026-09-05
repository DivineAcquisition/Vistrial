import { describe, expect, it } from "vitest";

import {
  membershipsFromRows,
  resolveActiveMembership,
  type MemberRow,
} from "@/lib/auth/memberships";
import type { Membership, OrgSummary } from "@/lib/auth/types";

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

function membership(orgId: string): Membership {
  return {
    id: `member-${orgId}`,
    orgId,
    role: "setter",
    displayName: "Malik",
    email: "malik@divineacquisition.io",
    surfaceAccess: "operator",
    org: { ...org, id: orgId, slug: orgId },
  };
}

describe("resolveActiveMembership", () => {
  const first = membership("org-1");
  const second = membership("org-2");

  it("uses the only membership and resets a cookie that disagrees", () => {
    expect(resolveActiveMembership([first], undefined)).toEqual({
      active: first,
      cookieNeedsReset: true,
    });
    expect(resolveActiveMembership([first], "org-9")).toEqual({
      active: first,
      cookieNeedsReset: true,
    });
  });

  it("leaves the cookie alone when it already names the only membership", () => {
    expect(resolveActiveMembership([first], "org-1")).toEqual({
      active: first,
      cookieNeedsReset: false,
    });
  });

  it("honours the cookie when the caller belongs to that org", () => {
    expect(resolveActiveMembership([first, second], "org-2")).toEqual({
      active: second,
      cookieNeedsReset: false,
    });
  });

  it("falls back to the first membership when the cookie is missing", () => {
    expect(resolveActiveMembership([first, second], undefined)).toEqual({
      active: first,
      cookieNeedsReset: true,
    });
  });

  // A tampered cookie is the interesting case: it must never widen access to an
  // org the caller does not hold a membership in.
  it("ignores a cookie naming an org the caller does not belong to", () => {
    const resolved = resolveActiveMembership([first, second], "org-someone-else");
    expect(resolved.active).toBe(first);
    expect(resolved.cookieNeedsReset).toBe(true);
  });

  it.each(["", "   ", "not-a-uuid", "org-1; org-3", "../org-3"])(
    "falls back safely for the junk cookie value %j",
    (value) => {
      const resolved = resolveActiveMembership([first, second], value);
      expect([first.orgId, second.orgId]).toContain(resolved.active.orgId);
      expect(resolved.cookieNeedsReset).toBe(true);
    }
  );

  it("only ever returns an org drawn from the caller's own memberships", () => {
    for (const cookie of [undefined, "org-1", "org-2", "org-3"]) {
      const resolved = resolveActiveMembership([first, second], cookie);
      expect([first, second]).toContain(resolved.active);
    }
  });
});
