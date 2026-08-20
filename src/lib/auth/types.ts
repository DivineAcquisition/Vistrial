import type { User } from "@supabase/supabase-js";

import type { OrgRole } from "@/types/database";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  ghlLocationId: string | null;
};

export type Membership = {
  id: string;
  orgId: string;
  role: OrgRole;
  displayName: string;
  email: string;
  org: OrgSummary;
};

export type AuthContext = {
  user: User;
  member: Membership;
  org: OrgSummary;
  role: OrgRole;
  memberships: Membership[];
  cookieNeedsReset: boolean;
};

export type ClientOrgState = {
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  org: OrgSummary;
  role: OrgRole;
  memberId: string;
  memberships: Array<{
    memberId: string;
    role: OrgRole;
    org: OrgSummary;
  }>;
  cookieNeedsReset: boolean;
};
