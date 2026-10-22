"use server";

import { revalidatePath } from "next/cache";

import type { StaffResult } from "@/app/(workspace)/app/team/staff-actions";
import { getAuthContext } from "@/lib/auth/session";
import { assertRecentAuth } from "@/lib/staff/mfa-check";
import { dbMessage, staffDb } from "@/lib/staff/db";

const ID = /^[a-z][a-z0-9_]{1,39}$/;

async function admin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can change the agent registry." };
  await assertRecentAuth("/app/team/agents/registry");
  return { ok: true };
}

/** Save one agent entry as a new version with a note. The database checks the role again. */
export async function saveRegistryEntry(id: string, entry: Record<string, unknown>, note: string): Promise<StaffResult> {
  if (!ID.test(id)) return { ok: false, error: "Use lowercase letters, numbers and underscores for the id." };
  const gate = await admin();
  if (!gate.ok) return gate;
  const db = await staffDb();
  const { data, error } = await db.rpc("agent_registry_save", { p_id: id, p_entry: entry, p_note: note });
  if (error) return { ok: false, error: dbMessage(error, "Could not save that entry.") };
  revalidatePath("/app/team/agents/registry");
  revalidatePath("/app", "layout");
  return { ok: true, message: `Saved as version ${data}.` };
}

export async function saveArea(id: string, entry: Record<string, unknown>, note: string): Promise<StaffResult> {
  if (!ID.test(id)) return { ok: false, error: "Use lowercase letters, numbers and underscores for the id." };
  const gate = await admin();
  if (!gate.ok) return gate;
  const db = await staffDb();
  const { data, error } = await db.rpc("agent_area_save", { p_id: id, p_entry: entry, p_note: note });
  if (error) return { ok: false, error: dbMessage(error, "Could not save that area.") };
  revalidatePath("/app/team/agents/registry");
  return { ok: true, message: `Saved as version ${data}.` };
}

/** Staff enable (waits for the Owner), disable, or lock one agent for one workspace. */
export async function setWorkspaceAgent(
  orgId: string,
  agentId: string,
  change: "enable" | "disable" | "lock" | "unlock",
  reason: string,
): Promise<StaffResult> {
  if (!ID.test(agentId)) return { ok: false, error: "Unknown agent." };
  const gate = await admin();
  if (!gate.ok) return gate;
  const db = await staffDb();
  if (change === "lock" || change === "unlock") {
    const { error } = await db.rpc("agent_set_lock", { p_org_id: orgId, p_agent_id: agentId, p_locked: change === "lock", p_reason: reason });
    if (error) return { ok: false, error: dbMessage(error, "Could not change that lock.") };
  } else {
    const { error } = await db.rpc("agent_set_enabled", { p_org_id: orgId, p_agent_id: agentId, p_on: change === "enable", p_withdraw_open: false });
    if (error) return { ok: false, error: dbMessage(error, "Could not change that agent.") };
  }
  revalidatePath("/app/team/agents/registry");
  return {
    ok: true,
    message: change === "enable" ? "Turned on. It waits for the Owner to confirm." : change === "disable" ? "Turned off." : change === "lock" ? "Locked." : "Unlocked.",
  };
}
