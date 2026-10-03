import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";
import { loadGateState } from "@/lib/home/gate";
import { EXECUTION_ACTION_TYPES, type ExecutionKind } from "@/lib/execution/kinds";

/**
 * What lets a write happen. Exactly one of these three, and each is checked
 * against the database rather than trusted from the caller:
 *
 * - approval_item: a person approved a queue item of the matching type.
 * - auto_run: the workspace owner set this action type to auto-run.
 * - owner_test: an owner or admin pressed "Send a test" on the connection card.
 */
export type ExecutionAuthorization =
  | { kind: "approval_item"; approvalItemId: string; approvedByMemberId: string }
  | { kind: "auto_run" }
  | { kind: "owner_test"; memberId: string };

export type AuthorizationResult =
  | { ok: true; kind: ExecutionAuthorization["kind"]; approvalItemId: string | null; memberId: string | null }
  | { ok: false; reason: string };

async function activeMember(db: GhlDb, orgId: string, memberId: string, roles: string[] | null) {
  const { data } = await db
    .from("org_members")
    .select("id, role, active")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data || !data.active) return false;
  return roles ? roles.includes(data.role) : true;
}

export async function authorizeExecution(
  db: GhlDb,
  args: { orgId: string; kind: ExecutionKind; authorization: ExecutionAuthorization }
): Promise<AuthorizationResult> {
  const actionType = EXECUTION_ACTION_TYPES[args.kind];

  const { data: org } = await db
    .from("organizations")
    .select("agents_halted")
    .eq("id", args.orgId)
    .maybeSingle();
  if (!org) return { ok: false, reason: "That workspace does not exist." };
  if (org.agents_halted) {
    return { ok: false, reason: "Everything Vistrial does on its own is paused for this workspace." };
  }

  const mode = (await loadGateState(db, args.orgId)).choice(actionType).mode;
  if (mode === "off") {
    return { ok: false, reason: "This is turned off in approval settings, so nothing was sent." };
  }

  const { authorization } = args;
  if (authorization.kind === "auto_run") {
    if (mode !== "auto_run") {
      return { ok: false, reason: "This workspace asks first. It needs an approval before it posts." };
    }
    return { ok: true, kind: "auto_run", approvalItemId: null, memberId: null };
  }

  if (authorization.kind === "owner_test") {
    if (!(await activeMember(db, args.orgId, authorization.memberId, ["owner", "admin"]))) {
      return { ok: false, reason: "Only an owner or admin can send a test." };
    }
    return { ok: true, kind: "owner_test", approvalItemId: null, memberId: authorization.memberId };
  }

  const { data: item } = await db
    .from("approval_items")
    .select("id, org_id, action_type, status")
    .eq("id", authorization.approvalItemId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!item || item.action_type !== actionType) {
    return { ok: false, reason: "That approval does not cover this kind of post." };
  }
  if (item.status !== "running" && item.status !== "succeeded") {
    return { ok: false, reason: "That approval is not active." };
  }
  if (!(await activeMember(db, args.orgId, authorization.approvedByMemberId, null))) {
    return { ok: false, reason: "A named person has to approve this." };
  }
  return {
    ok: true,
    kind: "approval_item",
    approvalItemId: item.id,
    memberId: authorization.approvedByMemberId,
  };
}
