import type { User } from "@supabase/supabase-js";

/** "setter": a placed setter's seat. "client": a client owner or member. */
export type StellarMemberRole = "setter" | "client";

export type StellarMember = {
  id: string;
  orgId: string;
  orgName: string;
  orgTimezone: string;
  role: StellarMemberRole;
  displayName: string;
  email: string;
};

/**
 * Stellar's two kinds of people. Vistrial staff (Service Team or Platform
 * Admin) reach the DA console for the workspaces they are assigned to, and a
 * placed setter is staff whose seat is a live placement's setter. Clients are
 * the business's own owners and members.
 */
export type StellarAuthContext =
  | {
      kind: "da_operator";
      user: User;
      /** Set when this staff member is the setter on a live placement. */
      setter: StellarMember | null;
    }
  | {
      kind: "member";
      user: User;
      member: StellarMember;
    };
