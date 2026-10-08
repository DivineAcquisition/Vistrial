import type { User } from "@supabase/supabase-js";

import type {
  MemberSeat,
  OrgRole,
  PlatformRole,
  SurfaceAccess,
  WorkspaceStatus,
} from "@/types/database";

/**
 * The five roles, as one value per person per workspace. Owner, Member and
 * Operator come from the person's seat in that workspace; Service Team and
 * Platform Admin from their platform staff record.
 */
export type WorkspaceRole = "platform_admin" | "service_team" | "owner" | "member" | "operator";

export type OrgSummary = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  ghlLocationId: string | null;
  status: WorkspaceStatus;
  isPlatformWorkspace: boolean;
};

export type Membership = {
  id: string;
  orgId: string;
  role: OrgRole;
  seat: MemberSeat;
  canApprove: boolean;
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
  workspaceRole: WorkspaceRole;
  /** Staff working in this workspace: a Platform Admin, or Service Team assigned to it. */
  isStaff: boolean;
  /** A Platform Admin, whatever the workspace. Platform-wide screens only. */
  isPlatformAdmin: boolean;
  platformRole: PlatformRole | null;
  /** Service Team granted template access, or any Platform Admin. */
  templateAccess: boolean;
  /** The stored workspace was not in this person's list, so another one was opened. */
  lostWorkspace: boolean;
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
  workspaceRole: WorkspaceRole;
  isStaff: boolean;
  isPlatformAdmin: boolean;
  canApprove: boolean;
  templateAccess: boolean;
  lostWorkspace: boolean;
  memberId: string;
  surfaceAccess: SurfaceAccess;
  memberships: Array<{
    memberId: string;
    role: OrgRole;
    org: OrgSummary;
  }>;
  cookieNeedsReset: boolean;
};
