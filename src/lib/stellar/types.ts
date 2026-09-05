import type { User } from "@supabase/supabase-js";

export type StellarMemberRole = "setter" | "client_viewer";

export type StellarMember = {
  id: string;
  orgId: string;
  orgName: string;
  orgTimezone: string;
  role: StellarMemberRole;
  displayName: string;
  email: string;
};

export type StellarAuthContext =
  | {
      kind: "da_operator";
      user: User;
    }
  | {
      kind: "member";
      user: User;
      member: StellarMember;
    };
