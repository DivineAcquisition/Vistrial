import type { User } from "@supabase/supabase-js";

import type { OrgRole, SurfaceAccess } from "@/types/database";

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
  surfaceAccess: SurfaceAccess;
  org: OrgSummary;
};

export type AuthContext = {
  user: User;
  member: Membership;
  org: OrgSummary;
  role: OrgRole;
  isPlatformAdmin: boolean;
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
  isPlatformAdmin: boolean;
  memberId: string;
  surfaceAccess: SurfaceAccess;
  memberships: Array<{
    memberId: string;
    role: OrgRole;
    org: OrgSummary;
  }>;
  cookieNeedsReset: boolean;
};
