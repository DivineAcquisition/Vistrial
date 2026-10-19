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

import { chooseDirectory, type DirectorySnapshot } from "@/lib/directory/choose";
import { userConvex } from "@/lib/directory/commit";

const MEMBER_COLUMNS =
  "id, org_id, role, seat, can_approve, can_see_money, can_export, can_manage_connections, avatar_path, display_name, email, surface_access";
const ORG_COLUMNS = "id, name, slug, timezone, ghl_location_id, status, is_platform_workspace";
const CONVEX_DIRECTORY_MS = 4000;

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Convex directory timed out.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function snapshotFromMine(mine: Mine): DirectorySnapshot {
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
  return {
    staff: mine.staff
      ? {
          role: mine.staff.role as PlatformRole,
          templateAccess: mine.staff.templateAccess,
          displayName: mine.staff.displayName,
        }
      : null,
    memberships: membershipsFromRows(rows, orgs),
  };
}

async function orgsByIds(orgIds: string[]): Promise<Map<string, OrgSummary>> {
  if (orgIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select(ORG_COLUMNS).in("id", orgIds);
  if (error || !data) return new Map();
  return new Map(
    data.map((org) => [
      org.id,
      {
        id: org.id,
        name: org.name,
        slug: org.slug,
        timezone: org.timezone,
        ghlLocationId: org.ghl_location_id,
        status: org.status,
        isPlatformWorkspace: org.is_platform_workspace,
      },
    ]),
  );
}

async function loadPostgresDirectory(): Promise<DirectorySnapshot & { seatCount: number }> {
  const empty = { staff: null, memberships: [], seatCount: 0 };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return empty;

    const { data: staffRow } = await supabase
      .from("platform_staff")
      .select("role, template_access, display_name, active")
      .eq("user_id", user.id)
      .maybeSingle();
    const staff =
      staffRow && staffRow.active
        ? {
            role: staffRow.role,
            templateAccess: staffRow.template_access,
            displayName: staffRow.display_name,
          }
        : null;

    const { data, error } = await supabase
      .from("org_members")
      .select(MEMBER_COLUMNS)
      .eq("user_id", user.id)
      .eq("active", true)
      .neq("seat", "agent")
      .order("created_at", { ascending: true });
    if (error || !data) {
      const { count } = await supabase
        .from("org_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("active", true);
      return { staff, memberships: [], seatCount: count ?? 0 };
    }
    if (data.length === 0) return { staff, memberships: [], seatCount: 0 };

    const orgs = await orgsByIds([...new Set(data.map((row) => row.org_id))]);
    const memberships = membershipsFromRows(data as MemberRow[], orgs).sort((a, b) => a.org.name.localeCompare(b.org.name));
    return { staff, memberships, seatCount: memberships.length > 0 ? memberships.length : data.length };
  } catch {
    return empty;
  }
}

async function loadConvexSnapshot(): Promise<DirectorySnapshot | null> {
  try {
    await withTimeout(flushDirectoryOutbox(), CONVEX_DIRECTORY_MS);
    const client = await userConvex();
    const mine = (await withTimeout(client.query(api.directory.listMine, {}), CONVEX_DIRECTORY_MS)) as Mine;
    return snapshotFromMine(mine);
  } catch {
    return null;
  }
}

export const loadConvexDirectory = cache(async (): Promise<{
  staff: { role: PlatformRole; templateAccess: boolean; displayName: string } | null;
  memberships: Membership[];
  legacyStillHasSeats: boolean;
}> => {
  const convex = await loadConvexSnapshot();
  if (convex && convex.memberships.length > 0) {
    return { ...convex, legacyStillHasSeats: false };
  }
  const postgres = await loadPostgresDirectory();
  return chooseDirectory({ convex, postgres, postgresSeatCount: postgres.seatCount });
});
