import "server-only";

import { encryptSecret } from "@/lib/ghl/crypto";
import {
  EXECUTION_TOOLS,
  GATE_MODES,
  MESSAGE_KINDS,
  type ExecutionType,
  type GateMode,
  type MessageKind,
} from "@/lib/sales-os/catalog";
import { isDiscordPostingLink, isSlackPostingLink } from "@/lib/sales-os/executions/channels";
import { driveConfigured } from "@/lib/sales-os/executions/drive";
import { loadDestinations, loadGateMode, loadRoutes } from "@/lib/sales-os/executions/run";
import type { DestinationView, RouteView } from "@/lib/sales-os/executions/types";
import type { SalesOsActor } from "@/lib/sales-os/session";

export type SalesOsSettings = {
  canManage: boolean;
  gates: Record<ExecutionType, GateMode>;
  destinations: DestinationView[];
  routes: RouteView[];
  driveAvailable: boolean;
  encryptionReady: boolean;
};

function encryptionReady(): boolean {
  return Boolean(process.env.GHL_TOKEN_ENCRYPTION_KEY?.trim());
}

export async function loadSalesOsSettings(actor: SalesOsActor): Promise<SalesOsSettings> {
  const [destinations, routes, gateEntries] = await Promise.all([
    loadDestinations(actor.db, actor.orgId),
    loadRoutes(actor.db, actor.orgId),
    Promise.all(EXECUTION_TOOLS.map(async (type) => [type, await loadGateMode(actor.db, actor.orgId, type)] as const)),
  ]);
  return {
    canManage: actor.canExecute,
    gates: Object.fromEntries(gateEntries) as Record<ExecutionType, GateMode>,
    destinations: destinations.map((d) => ({ id: d.id, kind: d.kind, label: d.label, accountLabel: d.accountLabel, active: d.active, createdAt: d.createdAt })),
    routes,
    driveAvailable: driveConfigured(),
    encryptionReady: encryptionReady(),
  };
}

type Result = { ok: true } | { ok: false; error: string };

function managerOnly(actor: SalesOsActor): Result | null {
  return actor.canExecute ? null : { ok: false, error: "Only an owner or admin can change this." };
}

/** Gate configuration is itself gated: RLS refuses anyone but an owner or admin. */
export async function saveGateMode(actor: SalesOsActor, type: string, mode: string): Promise<Result> {
  const denied = managerOnly(actor);
  if (denied) return denied;
  if (!(EXECUTION_TOOLS as readonly string[]).includes(type) || !(GATE_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: "That isn't a setting Vistrial has." };
  }
  const { error } = await actor.db.from("sales_os_gates").upsert(
    {
      org_id: actor.orgId,
      execution_type: type,
      mode,
      updated_by_member_id: actor.memberId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,execution_type" }
  );
  return error ? { ok: false, error: "Couldn't save that. Only an owner or admin can change approvals." } : { ok: true };
}

export async function addChannel(
  actor: SalesOsActor,
  input: { kind: string; label: string; link: string }
): Promise<Result> {
  const denied = managerOnly(actor);
  if (denied) return denied;
  if (!encryptionReady()) return { ok: false, error: "This deployment can't store connection links safely yet." };
  const label = input.label.trim().slice(0, 80);
  const link = input.link.trim();
  if (!label) return { ok: false, error: "Give the channel a name your team will recognise, like #sales-wins." };
  if (input.kind === "slack_channel") {
    if (!isSlackPostingLink(link)) {
      return { ok: false, error: "That isn't a Slack posting link. It starts with https://hooks.slack.com/services/." };
    }
  } else if (input.kind === "discord_channel") {
    if (!isDiscordPostingLink(link)) {
      return { ok: false, error: "That isn't a Discord posting link. It starts with https://discord.com/api/webhooks/." };
    }
  } else {
    return { ok: false, error: "Vistrial can post to Slack and Discord channels." };
  }
  const { error } = await actor.db.from("sales_os_destinations").insert({
    org_id: actor.orgId,
    kind: input.kind,
    label,
    secret_ciphertext: encryptSecret(link),
    created_by_member_id: actor.memberId,
  });
  return error ? { ok: false, error: "Couldn't save that channel." } : { ok: true };
}

/** Turning a destination off stops Vistrial using it. The row stays, so the record of what went there stays too. */
export async function setDestinationActive(actor: SalesOsActor, id: string, active: boolean): Promise<Result> {
  const denied = managerOnly(actor);
  if (denied) return denied;
  const { error } = await actor.db
    .from("sales_os_destinations")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("org_id", actor.orgId)
    .eq("id", id);
  return error ? { ok: false, error: "Couldn't change that." } : { ok: true };
}

export async function saveRoute(actor: SalesOsActor, kind: string, destinationId: string | null): Promise<Result> {
  const denied = managerOnly(actor);
  if (denied) return denied;
  if (!(MESSAGE_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "That isn't a kind of post Vistrial makes." };
  if (destinationId) {
    const destinations = await loadDestinations(actor.db, actor.orgId);
    const destination = destinations.find((d) => d.id === destinationId && d.active);
    if (!destination || destination.kind === "google_drive") return { ok: false, error: "Pick a connected Slack or Discord channel." };
  }
  const { error } = await actor.db.from("sales_os_routes").upsert(
    {
      org_id: actor.orgId,
      message_kind: kind as MessageKind,
      destination_id: destinationId,
      updated_by_member_id: actor.memberId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,message_kind" }
  );
  return error ? { ok: false, error: "Couldn't save that." } : { ok: true };
}

export async function loadManagers(actor: SalesOsActor): Promise<Array<{ name: string; role: string }>> {
  const { data } = await actor.db
    .from("org_members")
    .select("display_name, role")
    .eq("org_id", actor.orgId)
    .eq("active", true)
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => ({ name: row.display_name, role: row.role }));
}

/** Onboarding counts this step done once every approval choice has been saved explicitly. */
export async function salesOsConfigured(actor: SalesOsActor): Promise<boolean> {
  const { count } = await actor.db
    .from("sales_os_gates")
    .select("execution_type", { count: "exact", head: true })
    .eq("org_id", actor.orgId);
  return (count ?? 0) >= EXECUTION_TOOLS.length;
}
