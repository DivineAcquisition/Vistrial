"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { agentDefinition } from "@/lib/agents/catalog";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { AgentId } from "@/lib/agents/types";

async function requireManager() {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) {
    return { ok: false as const, error: "You do not have permission to change these settings.", ctx };
  }
  return { ok: true as const, ctx };
}

export async function saveAgentHalt(
  _prev: SettingsSaveResult,
  formData: FormData,
): Promise<SettingsSaveResult> {
  const gate = await requireManager();
  if (!gate.ok) return { status: "error", error: gate.error };
  const global = formData.get("agents_halted") === "on";
  const crm = formData.get("agent_crm_writes_halted") === "on";
  const calendar = formData.get("agent_calendar_writes_halted") === "on";
  const db = await createClient();
  const { error } = await db
    .from("organizations")
    .update({
      agents_halted: global,
      agent_crm_writes_halted: crm,
      agent_calendar_writes_halted: calendar,
    })
    .eq("id", gate.ctx.org.id);
  if (error) return { status: "error", error: "Could not save the stop switches." };
  revalidatePath("/app/settings/agents");
  return { status: "saved" };
}

export async function saveAgentIdentity(
  _prev: SettingsSaveResult,
  formData: FormData,
): Promise<SettingsSaveResult> {
  const gate = await requireManager();
  if (!gate.ok) return { status: "error", error: gate.error };
  const memberId = String(formData.get("agent_run_as_member_id") ?? "").trim();
  const db = await createClient();
  if (!memberId) {
    await db.from("org_members").update({ is_agent_identity: false }).eq("org_id", gate.ctx.org.id);
    const { error } = await db
      .from("organizations")
      .update({ agent_run_as_member_id: null })
      .eq("id", gate.ctx.org.id);
    if (error) return { status: "error", error: "Could not clear who scheduled work runs as." };
    revalidatePath("/app/settings/agents");
    revalidatePath("/app/settings/members");
    return { status: "saved" };
  }
  const { data: member } = await db
    .from("org_members")
    .select("id, active, role")
    .eq("org_id", gate.ctx.org.id)
    .eq("id", memberId)
    .maybeSingle();
  if (!member || !member.active) {
    return { status: "error", error: "Pick an active person on this team." };
  }
  await db.from("org_members").update({ is_agent_identity: false }).eq("org_id", gate.ctx.org.id);
  const { error: flagError } = await db
    .from("org_members")
    .update({ is_agent_identity: true })
    .eq("org_id", gate.ctx.org.id)
    .eq("id", memberId);
  if (flagError) return { status: "error", error: "Could not mark that person." };
  const { error } = await db
    .from("organizations")
    .update({ agent_run_as_member_id: memberId })
    .eq("id", gate.ctx.org.id);
  if (error) return { status: "error", error: "Could not save who scheduled work runs as." };
  revalidatePath("/app/settings/agents");
  revalidatePath("/app/settings/members");
  return { status: "saved" };
}

export async function saveOrgAgent(
  _prev: SettingsSaveResult,
  formData: FormData,
): Promise<SettingsSaveResult> {
  const gate = await requireManager();
  if (!gate.ok) return { status: "error", error: gate.error };
  const agentId = String(formData.get("agent_id") ?? "") as AgentId;
  const definition = agentDefinition(agentId);
  if (!definition) return { status: "error", error: "That agent is not in this product." };
  const enabled = formData.get("enabled") === "on";
  const observation = formData.get("observation_mode") === "on";
  const runCap = Number(formData.get("daily_run_cap"));
  const spendCap = Number(formData.get("daily_spend_cap_usd"));
  if (!Number.isInteger(runCap) || runCap < 1 || runCap > 1000) {
    return { status: "error", error: "The daily run cap has to be a whole number from 1 to 1000." };
  }
  if (!Number.isFinite(spendCap) || spendCap < 0 || spendCap > 10000) {
    return { status: "error", error: "The daily spend cap has to be a number from 0 to 10000." };
  }
  if (enabled && definition.writes && !observation && formData.get("allow_act") !== "on") {
    return {
      status: "error",
      error: "A writing agent starts in watch-first. Turn that off only after you have reviewed runs.",
    };
  }
  const db = await createClient();
  const { error } = await (db as unknown as { from: (t: string) => { upsert: (v: object) => Promise<{ error: { message: string } | null }> } })
    .from("org_agent_settings")
    .upsert({
    org_id: gate.ctx.org.id,
    agent_id: agentId,
    enabled,
    observation_mode: definition.writes ? observation : false,
    daily_run_cap: runCap,
    daily_spend_cap_usd: spendCap,
  });
  if (error) return { status: "error", error: "Could not save that agent." };
  revalidatePath("/app/settings/agents");
  return { status: "saved" };
}

export async function loadOperatorAvailabilityAction(): Promise<{
  ok: boolean;
  message: string | null;
}> {
  const { loadAgentRunContext } = await import("@/lib/agents/context");
  const { actorFromMember } = await import("@/lib/agents/identity");
  const ctx = await getAuthContext();
  const loaded = await loadAgentRunContext({
    orgId: ctx.org.id,
    agentId: "operator",
    mode: "on_demand",
    requester: actorFromMember({
      userId: ctx.user.id,
      memberId: ctx.member.id,
      role: ctx.role,
      displayName: ctx.member.displayName,
    }),
    timezone: ctx.org.timezone,
  });
  if (!loaded.gate.ok) return { ok: false, message: loaded.gate.message };
  return { ok: true, message: null };
}
