import { describe, expect, it } from "vitest";

import { chooseDirectory, type DirectorySnapshot } from "@/lib/directory/choose";
import type { Membership } from "@/lib/auth/types";

function membership(id: string): Membership {
  return {
    id,
    orgId: "org-1",
    role: "owner",
    seat: "customer",
    canApprove: true,
    canSeeMoney: true,
    canExport: true,
    canManageConnections: false,
    avatarPath: null,
    displayName: "Owner",
    email: "owner@example.com",
    surfaceAccess: "operator",
    org: {
      id: "org-1",
      name: "Acme",
      slug: "acme",
      timezone: "America/New_York",
      ghlLocationId: null,
      status: "active",
      isPlatformWorkspace: false,
    },
  };
}

const staff = { role: "platform_admin" as const, templateAccess: true, displayName: "Admin" };

function snapshot(memberships: Membership[], withStaff = false): DirectorySnapshot {
  return { staff: withStaff ? staff : null, memberships };
}

describe("chooseDirectory", () => {
  it("uses Convex when that read has seats", () => {
    const convex = snapshot([membership("convex")], true);
    const chosen = chooseDirectory({
      convex,
      postgres: snapshot([membership("postgres")]),
      postgresSeatCount: 1,
    });
    expect(chosen.memberships.map((row) => row.id)).toEqual(["convex"]);
    expect(chosen.staff).toBe(staff);
    expect(chosen.legacyStillHasSeats).toBe(false);
  });

  it("uses Postgres seats when Convex is empty", () => {
    const chosen = chooseDirectory({
      convex: snapshot([], true),
      postgres: snapshot([membership("postgres")]),
      postgresSeatCount: 1,
    });
    expect(chosen.memberships.map((row) => row.id)).toEqual(["postgres"]);
    expect(chosen.staff).toBe(staff);
    expect(chosen.legacyStillHasSeats).toBe(false);
  });

  it("uses Postgres seats when the Convex read fails", () => {
    const chosen = chooseDirectory({
      convex: null,
      postgres: snapshot([membership("postgres")], true),
      postgresSeatCount: 1,
    });
    expect(chosen.memberships.map((row) => row.id)).toEqual(["postgres"]);
    expect(chosen.staff?.role).toBe("platform_admin");
    expect(chosen.legacyStillHasSeats).toBe(false);
  });

  it("keeps a Convex staff record when neither store has a seat", () => {
    const chosen = chooseDirectory({
      convex: snapshot([], true),
      postgres: snapshot([]),
      postgresSeatCount: 0,
    });
    expect(chosen.memberships).toEqual([]);
    expect(chosen.staff).toBe(staff);
    expect(chosen.legacyStillHasSeats).toBe(false);
  });

  it("marks a Postgres seat that could be counted but not loaded", () => {
    const chosen = chooseDirectory({
      convex: null,
      postgres: snapshot([]),
      postgresSeatCount: 2,
    });
    expect(chosen.memberships).toEqual([]);
    expect(chosen.legacyStillHasSeats).toBe(true);
  });
});
