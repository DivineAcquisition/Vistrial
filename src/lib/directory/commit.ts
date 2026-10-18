import "server-only";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function convexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("Convex is not configured.");
  return url;
}

export async function userConvex(): Promise<ConvexHttpClient> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You do not have access to that.");
  const client = new ConvexHttpClient(convexUrl());
  client.setAuth(token);
  return client;
}

async function replicate(table: string, row: Record<string, unknown>, remove = false): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.rpc("directory_replicate" as never, {
    p_table: table,
    p_row: row,
    p_delete: remove,
  } as never);
  if (error) throw new Error(error.message);
}

export async function commitMemberPatch(workspaceId: string, legacyId: string, fields: Record<string, unknown>): Promise<void> {
  const client = await userConvex();
  const row = await client.mutation(api.directory.patchMember, { workspaceId, legacyId, fields });
  await replicate("org_members", row as Record<string, unknown>);
}

export async function commitSelfPatch(workspaceId: string, legacyId: string, fields: Record<string, unknown>): Promise<void> {
  const client = await userConvex();
  const row = await client.mutation(api.directory.patchSelf, { workspaceId, legacyId, fields });
  await replicate("org_members", row as Record<string, unknown>);
}

export async function commitWorkspacePatch(workspaceId: string, fields: Record<string, unknown>): Promise<void> {
  const client = await userConvex();
  const row = await client.mutation(api.directory.patchWorkspace, { workspaceId, fields });
  await replicate("organizations", row as Record<string, unknown>);
}

export async function commitAgentIdentity(workspaceId: string, legacyId: string | null): Promise<void> {
  const client = await userConvex();
  const saved = (await client.mutation(api.directory.setAgentIdentity, { workspaceId, legacyId })) as {
    workspace: Record<string, unknown>;
    members: Record<string, unknown>[];
  };
  for (const member of saved.members) await replicate("org_members", member);
  await replicate("organizations", saved.workspace);
}

export async function commitInvite(args: {
  workspaceId: string;
  email: string;
  role: string;
  invitedBy: string;
  surfaceAccess: string;
}): Promise<{ token: string; id: string }> {
  const client = await userConvex();
  const row = (await client.mutation(api.directory.createInvite, args)) as unknown as { token: string; id: string };
  await replicate("org_invites", row as unknown as Record<string, unknown>);
  return { token: row.token, id: row.id };
}

export async function commitInviteExpiry(workspaceId: string, legacyId: string, expiresAt: string): Promise<void> {
  const client = await userConvex();
  const row = await client.mutation(api.directory.refreshInvite, { workspaceId, legacyId, expiresAt });
  await replicate("org_invites", row as Record<string, unknown>);
}

export async function commitRevokeInvite(workspaceId: string, legacyId: string): Promise<void> {
  const client = await userConvex();
  const row = await client.mutation(api.directory.revokeInvite, { workspaceId, legacyId });
  await replicate("org_invites", { id: (row as { id: string }).id }, true);
}

export async function commitAssign(workspaceId: string, userId: string): Promise<void> {
  const client = await userConvex();
  const result = (await client.mutation(api.directory.assignStaff, { workspaceId, userId })) as {
    assignment: Record<string, unknown>;
    member: Record<string, unknown> | null;
  };
  if (result.member) await replicate("org_members", result.member);
  await replicate("workspace_assignments", result.assignment);
}

export async function commitUnassign(workspaceId: string, userId: string): Promise<void> {
  const client = await userConvex();
  const result = (await client.mutation(api.directory.endAssignment, { workspaceId, userId })) as {
    assignment: Record<string, unknown>;
    member: Record<string, unknown> | null;
  } | null;
  if (!result) return;
  if (result.member) await replicate("org_members", result.member);
  await replicate("workspace_assignments", result.assignment);
}

/** Webhooks and jobs have no signed-in person. The import key is the system principal. */
export async function systemMemberPatch(workspaceId: string, legacyId: string, fields: Record<string, unknown>): Promise<void> {
  const key = process.env.DIRECTORY_IMPORT_KEY;
  if (!key) throw new Error("Convex is not configured.");
  const client = new ConvexHttpClient(convexUrl());
  const row = await client.mutation(api.importDirectory.systemPatchMember, { key, workspaceId, legacyId, fields });
  await replicate("org_members", row as Record<string, unknown>);
}

export async function commitPlatformStaff(row: Record<string, unknown>): Promise<void> {
  const client = await userConvex();
  const saved = (await client.mutation(api.directory.upsertPlatformStaff, { row })) as { row: Record<string, unknown> };
  await replicate("platform_staff", saved.row);
}
