import type { Membership } from "@/lib/auth/types";
import type { PlatformRole } from "@/types/database";

export type DirectoryStaff = {
  role: PlatformRole;
  templateAccess: boolean;
  displayName: string;
};

export type DirectorySnapshot = {
  staff: DirectoryStaff | null;
  memberships: Membership[];
};

/**
 * Convex owns the directory once it actually has the caller's seats. A failed
 * read, or an empty one while Postgres still has those seats, keeps the app
 * on the Postgres membership the caller can already see.
 */
export function chooseDirectory(args: {
  convex: DirectorySnapshot | null;
  postgres: DirectorySnapshot;
  postgresSeatCount: number;
}): DirectorySnapshot & { legacyStillHasSeats: boolean } {
  if (args.convex && args.convex.memberships.length > 0) {
    return { ...args.convex, legacyStillHasSeats: false };
  }
  if (args.postgres.memberships.length > 0) {
    return {
      staff: args.postgres.staff ?? args.convex?.staff ?? null,
      memberships: args.postgres.memberships,
      legacyStillHasSeats: false,
    };
  }
  return {
    staff: args.convex?.staff ?? args.postgres.staff,
    memberships: [],
    legacyStillHasSeats: args.postgresSeatCount > 0,
  };
}
