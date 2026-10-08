import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { blockingIssues, stopReason, type ConfigConsumer } from "@/lib/config/consumers";
import { resolveConfig } from "@/lib/config/resolve";
import type { ConfigIssue, ConfigValues, EffectiveConfig, LayerSnapshot } from "@/lib/config/types";
import type { Database, Json } from "@/types/database";

type Db = SupabaseClient<Database>;
type LayerRow = Database["public"]["Tables"]["config_layers"]["Row"];

function snapshot(row: Pick<LayerRow, "field_values" | "locked_keys" | "version">): LayerSnapshot {
  return {
    values: (row.field_values ?? {}) as ConfigValues,
    lockedKeys: row.locked_keys ?? [],
    version: row.version,
  };
}

/** A level as it was at an earlier version, from its append-only history. */
async function layerAt(db: Db, layer: LayerRow, version: number): Promise<LayerSnapshot> {
  if (version === layer.version) return snapshot(layer);
  const { data, error } = await db
    .from("config_versions")
    .select("field_values, locked_keys, version")
    .eq("layer_id", layer.id)
    .eq("version", version)
    .maybeSingle();
  if (error) throw new Error(`config history read failed: ${error.message}`);
  if (!data) throw new Error(`config version ${version} of layer ${layer.id} is missing`);
  return snapshot(data);
}

/**
 * The effective configuration of one workspace: platform default, its
 * template, and its own overrides, at the versions it is pinned to (locked
 * rules always current). Server-only, with the service-role client; the same
 * answer as `config_effective` in the database, plus cross-field checks.
 */
export async function getEffectiveConfig(db: Db, orgId: string): Promise<EffectiveConfig> {
  const [{ data: pin, error: pinError }, { data: layers, error: layerError }] = await Promise.all([
    db.from("workspace_config_pins").select("template_id, template_version, platform_version").eq("org_id", orgId).maybeSingle(),
    db.from("config_layers").select("*").or(`level.eq.platform,org_id.eq.${orgId}`),
  ]);
  if (pinError) throw new Error(`config pins read failed: ${pinError.message}`);
  if (layerError) throw new Error(`config layers read failed: ${layerError.message}`);

  const platform = layers?.find((row) => row.level === "platform");
  if (!platform) throw new Error("The platform default configuration is missing.");
  const workspace = layers?.find((row) => row.level === "workspace" && row.org_id === orgId) ?? null;

  let template: LayerRow | null = null;
  let slug: string | null = null;
  if (pin?.template_id) {
    const [{ data: templateLayer, error: tError }, { data: templateRow }] = await Promise.all([
      db.from("config_layers").select("*").eq("level", "template").eq("template_id", pin.template_id).maybeSingle(),
      db.from("config_templates").select("slug").eq("id", pin.template_id).maybeSingle(),
    ]);
    if (tError) throw new Error(`config template read failed: ${tError.message}`);
    template = templateLayer ?? null;
    slug = templateRow?.slug ?? null;
  }

  const platformPinned = await layerAt(db, platform, pin?.platform_version ?? platform.version);
  const templatePinned =
    template && slug ? await layerAt(db, template, pin?.template_version ?? template.version) : null;

  return resolveConfig({
    platform: platformPinned,
    platformCurrent: snapshot(platform),
    template: templatePinned && slug ? { ...templatePinned, slug } : null,
    templateCurrent: template ? snapshot(template) : undefined,
    workspace: workspace ? snapshot(workspace) : null,
  });
}

export type ConfigGate =
  | { ok: true; config: EffectiveConfig }
  | { ok: false; reason: string; version: string; issues: ConfigIssue[] };

/**
 * The one way an agent or job reads a workspace's configuration. It names
 * itself (see CONFIG_CONSUMERS for the sections each reads). When a required
 * value in those sections is missing or invalid it returns the reason instead
 * of a configuration: the caller stops and records the reason on its run. The
 * stop is recorded for the workspace's staff; the notifications job alerts
 * them once (see alertNewConfigStops).
 *
 * For jobs and webhooks, which hold the service-role client. Agents that run
 * in a person's session use checkAgentConfig instead.
 */
export async function requireConfig(db: Db, orgId: string, consumer: ConfigConsumer): Promise<ConfigGate> {
  const config = await getEffectiveConfig(db, orgId);
  const issues = blockingIssues(config, consumer);
  if (issues.length === 0) {
    await db.rpc("config_resolve_stop", { p_org_id: orgId, p_consumer: consumer });
    return { ok: true, config };
  }

  const reason = stopReason(consumer, issues);
  await db.rpc("config_record_stop", {
    p_org_id: orgId,
    p_consumer: consumer,
    p_config_version: config.version,
    p_reason: reason,
    p_problems: issues as unknown as Json,
  });
  return { ok: false, reason, version: config.version, issues };
}
