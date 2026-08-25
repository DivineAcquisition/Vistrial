import { disconnectGhl } from "@/lib/ghl/connect";
import type { GhlDb } from "@/lib/ghl/tokens";
import { OFFBOARD_GRACE_DAYS } from "@/lib/ops/constants";
import { buildOrgExport, type OrgExportBundle } from "@/lib/ops/export";

export async function offboardOrganization(
  db: GhlDb,
  args: { orgId: string; reason: string; actorUserId?: string | null; actorEmail?: string | null }
): Promise<{ deleteAfter: string | null; exportBundle: OrgExportBundle }> {
  const exportBundle = await buildOrgExport(db, args.orgId);
  await disconnectGhl(db, args.orgId);
  const { data, error } = await db.rpc("mark_org_offboarded", {
    p_org_id: args.orgId,
    p_reason: args.reason,
    p_grace_days: OFFBOARD_GRACE_DAYS,
  });
  if (error) throw new Error(error.message);

  await db.from("ops_incidents").insert({
    kind: "offboarding",
    status: "mitigating",
    org_id: args.orgId,
    title: "Client offboarding started",
    timeline: [
      { at: new Date().toISOString(), event: "CRM disconnected and tokens revoked" },
      { at: new Date().toISOString(), event: "Sequences halted" },
      { at: new Date().toISOString(), event: "Export produced" },
      { at: new Date().toISOString(), event: "Org marked inactive for grace period" },
    ],
    cause: args.reason,
    impact: "Ingestion and dispatch stopped. Data retained until delete_after.",
    prevention: "Offboarding is the only path that disconnects a paying client.",
    created_by_user_id: args.actorUserId ?? null,
  });

  const deleteAfter =
    data && typeof data === "object" && "deleteAfter" in data
      ? String((data as { deleteAfter?: string }).deleteAfter ?? "")
      : null;

  return { deleteAfter, exportBundle };
}

export async function deleteOrganizationData(
  db: GhlDb,
  args: {
    orgId: string;
    confirmationName: string;
    reason: string;
    actorUserId?: string | null;
    actorEmail?: string | null;
  }
) {
  try {
    await disconnectGhl(db, args.orgId);
  } catch {
    // Tokens may already be gone. Deletion must still complete.
  }
  const { data, error } = await db.rpc("delete_org_data", {
    p_org_id: args.orgId,
    p_confirmation_name: args.confirmationName,
    p_reason: args.reason,
    p_actor_user_id: args.actorUserId ?? null,
    p_actor_email: args.actorEmail ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteOrgsPastGrace(db: GhlDb): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: due } = await db
    .from("organizations")
    .select("id, name")
    .not("offboarded_at", "is", null)
    .lte("delete_after", today);

  let deleted = 0;
  for (const org of due ?? []) {
    await deleteOrganizationData(db, {
      orgId: org.id,
      confirmationName: org.name,
      reason: "offboarding_grace_elapsed",
      actorEmail: "system:retention",
    });
    deleted += 1;
  }
  return deleted;
}
