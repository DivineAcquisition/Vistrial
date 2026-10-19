import "server-only";

import { cache } from "react";

import { api } from "../../../convex/_generated/api";
import { membershipsFromRows, type MemberRow } from "@/lib/auth/memberships";
import type { Membership, OrgSummary } from "@/lib/auth/types";
import type { MemberSeat, OrgRole, PlatformRole, SurfaceAccess, WorkspaceStatus } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ConvexHttpClient } from "convex/browser";
import type { SupabaseClient } from "@supabase/supabase-js";

import { userConvex } from "@/lib/directory/commit";

type Mine = {
  staff: {
    role: string;
    templateAccess: boolean;
    displayName: string;
    email: string;
  } | null;
  memberships: Array<{
    id: string;
    workspaceId: string;
    userId: string;
    role: string;
    seat: string;
    active: boolean;
    email: string;
    displayName: string;
    canExport: boolean;
    canApprove: boolean;
    canSeeMoney: boolean;
    canManageConnections: boolean;
    avatarPath: string | null;
    surfaceAccess: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
      timezone: string;
      status: string;
      isPlatformWorkspace: boolean;
      ghlLocationId: string | null;
    };
  }>;
};

async function flushDirectoryOutbox(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const key = process.env.DIRECTORY_IMPORT_KEY;
  if (!url || !key) return;
  try {
    const admin = getSupabaseAdmin() as unknown as SupabaseClient;
    const { data, error } = await admin
      .from("directory_outbox")
      .select("id, table_name, op, payload")
      .is("applied_at", null)
      .order("id", { ascending: true })
      .limit(100);
    if (error || !data?.length) return;
    const buckets = {
      workspaces: [] as Record<string, unknown>[],
      members: [] as Record<string, unknown>[],
      assignments: [] as Record<string, unknown>[],
      invites: [] as Record<string, unknown>[],
      staff: [] as Record<string, unknown>[],
    };
    for (const row of data) {
      if (row.op === "DELETE") continue;
      const payload = row.payload as Record<string, unknown>;
      if (row.table_name === "organizations") buckets.workspaces.push(payload);
      if (row.table_name === "org_members") buckets.members.push(payload);
      if (row.table_name === "workspace_assignments") buckets.assignments.push(payload);
      if (row.table_name === "org_invites") buckets.invites.push(payload);
      if (row.table_name === "platform_staff") buckets.staff.push(payload);
    }
    const client = new ConvexHttpClient(url);
    await client.mutation(api.importDirectory.importBatch, { key, ...buckets });
    await admin
      .from("directory_outbox")
      .update({ applied_at: new Date().toISOString() })
      .in(
        "id",
        data.map((row) => row.id),
      );
  } catch {
    // A missing outbox means this database has not taken the domain 1 migration yet.
  }
}

export const loadConvexDirectory = cache(async (): Promise<{
  staff: { role: PlatformRole; templateAccess: boolean; displayName: string } | null;
  memberships: Membership[];
  legacyStillHasSeats: boolean;
}> => {
  await flushDirectoryOutbox();
  const client = await userConvex();
  const mine = (await client.query(api.directory.listMine, {})) as Mine;
  const orgs = new Map<string, OrgSummary>();
  const rows: MemberRow[] = [];
  for (const member of mine.memberships) {
    orgs.set(member.workspace.id, {
      id: member.workspace.id,
      name: member.workspace.name,
      slug: member.workspace.slug,
      timezone: member.workspace.timezone,
      ghlLocationId: member.workspace.ghlLocationId,
      status: member.workspace.status as WorkspaceStatus,
      isPlatformWorkspace: member.workspace.isPlatformWorkspace,
    });
    rows.push({
      id: member.id,
      org_id: member.workspaceId,
      role: member.role as OrgRole,
      seat: member.seat as MemberSeat,
      can_approve: member.canApprove,
      can_see_money: member.canSeeMoney,
      can_export: member.canExport,
      can_manage_connections: member.canManageConnections,
      avatar_path: member.avatarPath,
      display_name: member.displayName,
      email: member.email,
      surface_access: member.surfaceAccess as SurfaceAccess,
    });
  }
  let legacyStillHasSeats = false;
  if (rows.length === 0) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { count } = await supabase
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("active", true);
      legacyStillHasSeats = (count ?? 0) > 0;
    }
  }
  return {
    staff: mine.staff
      ? {
          role: mine.staff.role as PlatformRole,
          templateAccess: mine.staff.templateAccess,
          displayName: mine.staff.displayName,
        }
      : null,
    memberships: membershipsFromRows(rows, orgs),
    legacyStillHasSeats,
  };
});
