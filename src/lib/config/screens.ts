import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveConfig } from "@/lib/config/resolve";
import { getEffectiveConfig } from "@/lib/config/server";
import type { ConfigValues, EffectiveConfig, LayerSnapshot } from "@/lib/config/types";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;
type LayerRow = Database["public"]["Tables"]["config_layers"]["Row"];

export type LayerInfo = { id: string; version: number; values: ConfigValues; lockedKeys: string[] };

function layerInfo(row: LayerRow): LayerInfo {
  return { id: row.id, version: row.version, values: (row.field_values ?? {}) as ConfigValues, lockedKeys: row.locked_keys ?? [] };
}

function snapshot(row: LayerRow): LayerSnapshot {
  return { values: (row.field_values ?? {}) as ConfigValues, lockedKeys: row.locked_keys ?? [], version: row.version };
}

export type TemplateSummary = { id: string; slug: string; name: string; description: string; status: string; version: number };

export async function loadTemplates(db: Db): Promise<TemplateSummary[]> {
  const [{ data: templates }, { data: layers }] = await Promise.all([
    db.from("config_templates").select("id, slug, name, description, status").order("name"),
    db.from("config_layers").select("template_id, version").eq("level", "template"),
  ]);
  const versions = new Map((layers ?? []).map((row) => [row.template_id, row.version]));
  return (templates ?? []).map((template) => ({ ...template, version: versions.get(template.id) ?? 0 }));
}

/**
 * The staff configuration screen for one workspace. Read with the person's own
 * session: row-level security already limits it to staff of this workspace.
 */
export async function loadWorkspaceScreen(db: Db, orgId: string) {
  const [effective, { data: layer }, { data: pin }, templates, { data: notices }, { data: readiness }, { data: stops }, { data: org }] =
    await Promise.all([
      getEffectiveConfig(db, orgId),
      db.from("config_layers").select("*").eq("level", "workspace").eq("org_id", orgId).maybeSingle(),
      db.from("workspace_config_pins").select("*").eq("org_id", orgId).maybeSingle(),
      loadTemplates(db),
      db
        .from("config_review_notices")
        .select("*")
        .eq("org_id", orgId)
        .in("status", ["pending", "postponed"])
        .order("created_at", { ascending: true }),
      db.from("config_readiness").select("*").eq("org_id", orgId).maybeSingle(),
      db.from("config_stops").select("*").eq("org_id", orgId).is("resolved_at", null).order("last_stopped_at", { ascending: false }),
      db.from("organizations").select("id, name, status, timezone").eq("id", orgId).maybeSingle(),
    ]);
  if (!layer || !org) return null;
  return {
    org,
    effective,
    layer: layerInfo(layer),
    pin,
    template: templates.find((template) => template.id === pin?.template_id) ?? null,
    templates,
    notices: notices ?? [],
    readiness,
    stops: stops ?? [],
  };
}

/** A template as it would resolve on its own, over the current platform default. */
export async function loadTemplateScreen(db: Db, templateId: string) {
  const [{ data: template }, { data: layer }, { data: platform }, { count: workspaces }] = await Promise.all([
    db.from("config_templates").select("*").eq("id", templateId).maybeSingle(),
    db.from("config_layers").select("*").eq("level", "template").eq("template_id", templateId).maybeSingle(),
    db.from("config_layers").select("*").eq("level", "platform").maybeSingle(),
    db.from("workspace_config_pins").select("org_id", { count: "exact", head: true }).eq("template_id", templateId),
  ]);
  if (!template || !layer || !platform) return null;
  const effective: EffectiveConfig = resolveConfig({
    platform: snapshot(platform),
    template: { ...snapshot(layer), slug: template.slug },
    workspace: null,
    includeWorkspaceOnly: false,
  });
  return { template, layer: layerInfo(layer), platformLayer: layerInfo(platform), effective, workspaces: workspaces ?? 0 };
}

export async function loadPlatformScreen(db: Db) {
  const { data: platform } = await db.from("config_layers").select("*").eq("level", "platform").maybeSingle();
  if (!platform) return null;
  const effective = resolveConfig({ platform: snapshot(platform), template: null, workspace: null, includeWorkspaceOnly: false });
  return { layer: layerInfo(platform), effective };
}

export type HistoryEntry = {
  version: number;
  source: string;
  note: string | null;
  changedAt: string;
  changedBy: string | null;
  changes: Array<{ key: string; before?: unknown; after?: unknown; lock?: string }>;
  values: ConfigValues;
};

/** Every version of one level, newest first, with who changed what. */
export async function loadHistory(db: Db, layerId: string): Promise<HistoryEntry[]> {
  const { data: versions } = await db
    .from("config_versions")
    .select("version, source, note, changed_at, changed_by, changes, field_values")
    .eq("layer_id", layerId)
    .order("version", { ascending: false })
    .limit(200);
  const people = [...new Set((versions ?? []).map((row) => row.changed_by).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (people.length) {
    const { data: staff } = await db.from("platform_staff").select("user_id, display_name").in("user_id", people);
    for (const person of staff ?? []) names.set(person.user_id, person.display_name);
  }
  return (versions ?? []).map((row) => ({
    version: row.version,
    source: row.source,
    note: row.note,
    changedAt: row.changed_at,
    changedBy: row.changed_by ? (names.get(row.changed_by) ?? "A team member") : "Vistrial",
    changes: (row.changes ?? []) as HistoryEntry["changes"],
    values: (row.field_values ?? {}) as ConfigValues,
  }));
}
